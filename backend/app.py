from flask import Flask, jsonify, request
from flask_cors import CORS
from parser import ZuulParser
import os
import yaml
import shutil
import subprocess
import tempfile
import hashlib
import json
import time
import google.generativeai as genai
from scheduler import JobScheduler
from ai_utils import get_ai_client, load_config



app = Flask(__name__, static_folder='../frontend/dist', static_url_path='/')
# Enable CORS for all domains on all routes
CORS(app, resources={r"/*": {"origins": "*"}})

def resolve_project_paths(sources):
    project_infos = []
    if not sources:
        return [], None
    
    if isinstance(sources, str):
        sources = [sources]

    # Remove duplicates from sources while preserving order
    seen_sources = set()
    unique_sources = []
    for s in sources:
        if s not in seen_sources:
            unique_sources.append(s)
            seen_sources.add(s)
    sources = unique_sources

    # Get clone directory from config
    config = load_config()
    clone_base_dir = config.get('clone_dir', 'repo_data')
    if not os.path.isabs(clone_base_dir):
        clone_base_dir = os.path.abspath(clone_base_dir)
        
    print(f"Cloning repositories into: {clone_base_dir}")

    for source in sources:
        # Strict check: must be a git url (or at least start with http/git/ssh)
        # Strict check: must be a git url (or at least start with http/git/ssh)
        if not (source.startswith('http') or source.startswith('git') or source.startswith('ssh')):
             print(f"Skipping non-git source: {source}")
             continue

        # Normalize URL for hashing (remove .git and trailing slashes) to ensure uniqueness
        normalized_source = source.strip().rstrip('/')
        if normalized_source.endswith('.git'):
            normalized_source = normalized_source[:-4]

        # Create a directory name based on the repo name or hash to avoid collisions and be readable
        repo_name = normalized_source.split('/')[-1]
        # Add hash to ensure uniqueness if multiple repos have same name
        url_hash = hashlib.md5(normalized_source.encode()).hexdigest()[:8]
        target_dir_name = f"{repo_name}_{url_hash}"
        
        target_path = os.path.join(clone_base_dir, target_dir_name)
        
        if not os.path.exists(target_path):
            print(f"Cloning {source} into {target_path}...")
            try:
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                subprocess.check_call(['git', 'clone', source, target_path])
            except subprocess.CalledProcessError as e:
                error_msg = f"Error cloning repository {source}: {e}"
                print(error_msg)
                return [], error_msg
        
        # Get current commit hash
        try:
            commit_hash = subprocess.check_output(['git', '-C', target_path, 'rev-parse', 'HEAD']).decode('utf-8').strip()
        except Exception as e:
            print(f"Error getting commit hash for {target_path}: {e}")
            commit_hash = 'master' # Fallback

        project_infos.append({
            'path': target_path,
            'url': source,
            'commit': commit_hash
        })
            
    return project_infos, None

# Load Config
config = load_config()
# Support both 'sources' (list) and legacy 'source' (string)
sources = config.get('sources', config.get('source'))
if not sources:
    print("WARNING: No 'sources' configured in config.yaml or 'SOURCES' environment variable.")
    print("The visualizer will start empty. Add sources via config or env var, or load them via the UI.")

PROJECT_INFOS, _ = resolve_project_paths(sources)

print(f"Using Zuul project paths: {PROJECT_INFOS}")
parser = ZuulParser(PROJECT_INFOS)

# Initialize Scheduler
# Initialize Scheduler
def refresh_parser():
    print("Refreshing parser cache...")
    parser.parse()

scheduler = JobScheduler(config, PROJECT_INFOS, on_update_callback=refresh_parser)
scheduler.start()

@app.route('/api/graph', methods=['GET'])
def get_graph():
    # Use cached data
    data = parser.get_graph_data()
    return jsonify(data)

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    question = data.get('question', '')
    job_name = data.get('jobName')
    
    # Load knowledge
    knowledge_text = ""
    if os.path.exists(KNOWLEDGE_FILE):
        with open(KNOWLEDGE_FILE, 'r') as f:
            knowledge_text = f.read()

    model = get_ai_client()
    
    if model and knowledge_text:
        try:
            prompt = f"""
You are an expert on the Zuul configuration and Ansible roles for this project.
Your knowledge base is the following Documentation:

{knowledge_text[:100000]} 

(Documentation truncated if too long)

The user is asking about job: {job_name if job_name else 'General'}
Question: {question}

Answer helpfuly and concisely based ONLY on the provided documentation.
"""
            response = model.generate_content(prompt)
            return jsonify({'answer': response.text})
        except Exception as e:
            print(f"AI Error: {e}")
            return jsonify({'answer': "Error querying AI service. Check logs."})

    # ... (fallback logic) ...
    if not parser.jobs:
        parser.parse()  
    job = parser.jobs.get(job_name)
    if not job:
         return jsonify({'answer': f"Job '{job_name}' not found or no job selected."})

    # Simple keyword-based intent detection
    if 'variable' in question or 'start' in question or 'env' in question:
        vars = job.get('vars', {})
        if not vars:
            return jsonify({'answer': "No variables defined for this job."})
        return jsonify({'answer': f"Variables: {vars}"})
    
    if 'role' in question:
        roles = job.get('roles', [])
        if not roles:
            return jsonify({'answer': "No roles defined for this job."})
        return jsonify({'answer': f"Roles: {roles}"})
        
    if 'parent' in question:
        parent = job.get('parent')
        return jsonify({'answer': f"Parent job is: {parent}"})

    if 'dependency' in question or 'depend' in question:
        deps = job.get('dependencies', [])
        return jsonify({'answer': f"Dependencies: {deps}"})
        
    KNOWLEDGE_FILE = 'repo_documentation.md' # Defined locally now or global constant moved down if needed, but safe here logic wise


    return jsonify({'answer': "AI is not configured or failed. Basic keyword search found nothing specific."})

@app.route('/api/load-repo', methods=['POST'])
def load_repo():
    data = request.json
    url = data.get('url')
    
    if not url:
        return jsonify({'error': 'URL is required'}), 400
        
    try:
        # Resolve just this new path
        new_infos, error = resolve_project_paths([url])
        if error:
             return jsonify({'error': f'Failed to resolve repository path: {error}'}), 400
        if not new_infos:
             return jsonify({'error': 'Failed to resolve repository path: Unknown error'}), 400
             
        new_info = new_infos[0]
        
        # Add to parser if not already there (check by path or url)
        exists = False
        for info in parser.project_infos:
            if info['path'] == new_info['path']:
                exists = True
                break
        
        if not exists:
            parser.project_infos.append(new_info)
            # scheduler.project_infos is the same list object as parser.project_infos
            # so we only need to append once to update both.
            
        parser.parse()
        
        # Save to history - REMOVED (Client side handling)
        # save_history_entry(url, new_info['path'])
        
        # Trigger explicit update/doc gen for this new repo
        scheduler.force_run()
        
        return jsonify({'message': 'Repository loaded successfully', 'path': new_info['path'], 'all_paths': parser.project_infos})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/repos', methods=['GET'])
def get_repos():
    # Return currently active repos
    return jsonify({
        'active': parser.project_infos 
    })

@app.route('/api/system/sync', methods=['POST'])
def sync_system():
    try:
        scheduler.force_run()
        return jsonify({'message': 'Sync triggered successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/system/status', methods=['GET'])
def system_status():
    ai_client = get_ai_client()
    return jsonify({
        'ai_enabled': ai_client is not None
    })

@app.route('/api/clear', methods=['POST'])
def clear_graph():
    global parser
    
    # Get static config sources to protect them
    config = load_config()
    static_sources = config.get('sources', config.get('source')) or []
    if isinstance(static_sources, str):
        static_sources = [static_sources]
    
    static_urls = set(static_sources)

    # Clean up non-static repos
    for info in parser.project_infos:
        url = info.get('url')
        path = info.get('path')
        
        if url not in static_urls:
            if os.path.exists(path):
                print(f"Deleting non-static repo: {path}")
                try:
                    shutil.rmtree(path)
                except Exception as e:
                    print(f"Failed to delete {path}: {e}")

    # Clear all paths from memory while maintaining shared reference if they are the same
    if parser.project_infos is scheduler.project_infos:
        parser.project_infos.clear()
    else:
        parser.project_infos = []
        scheduler.project_infos = []
    
    parser.jobs = {}
    parser.cached_data = None
    return jsonify({'message': 'Graph cleared and temporary repos deleted'})
    
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(app.static_folder + '/' + path):
        return app.send_static_file(path)
    return app.send_static_file('index.html')

if __name__ == '__main__':
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', 5001))
    debug = os.environ.get('FLASK_DEBUG', 'True').lower() == 'true'
    app.run(debug=debug, host=host, port=port)
