import os
import yaml
import json
import google.generativeai as genai

def load_config():
    config = {}
    config_path = 'config.yaml'
    if os.path.exists(config_path):
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f) or {}

    # Environment variable overrides
    if os.environ.get('CLONE_DIR'):
        config['clone_dir'] = os.environ.get('CLONE_DIR')
    
    if os.environ.get('SOURCES'):
        # Expect comma-separated list for env var
        config['sources'] = [s.strip() for s in os.environ.get('SOURCES').split(',')]

    if os.environ.get('DOC_UPDATE_INTERVAL'):
        try:
            config['doc_update_interval'] = int(os.environ.get('DOC_UPDATE_INTERVAL'))
        except ValueError:
            pass

    if os.environ.get('ENABLE_AI'):
        config['enable_ai'] = os.environ.get('ENABLE_AI').lower() == 'true'

    if os.environ.get('AI_AUTH_STRATEGY'):
        config['ai_auth_strategy'] = os.environ.get('AI_AUTH_STRATEGY')

    if os.environ.get('GEMINI_API_KEY'):
        config['gemini_api_key'] = os.environ.get('GEMINI_API_KEY')

    if os.environ.get('AI_MODEL'):
        config['ai_model'] = os.environ.get('AI_MODEL')

    return config

def get_ai_client():
    config = load_config()
    strategy = config.get('ai_auth_strategy', 'env')
    api_key = None

    if strategy == 'env':
        api_key = os.environ.get('GEMINI_API_KEY')
    elif strategy == 'file':
        auth_file = config.get('gemini_auth_file')
        if auth_file and os.path.exists(auth_file):
            with open(auth_file, 'r') as f:
                content = f.read().strip()
                try: 
                    creds = json.loads(content)
                    api_key = creds.get('api_key') or creds.get('key')
                except:
                    api_key = content
    
    if not api_key:
         api_key = config.get('gemini_api_key')

    if api_key:
        try:
            genai.configure(api_key=api_key)
            model_name = config.get('ai_model', 'gemini-flash-latest')
            return genai.GenerativeModel(model_name)
        except Exception as e:
            print(f"Error configuring Gemini client: {e}")
            return None
            
    return None
