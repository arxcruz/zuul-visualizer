import os
from ruamel.yaml import YAML

class ZuulParser:
    def __init__(self, project_infos):
        # project_infos is a list of dicts: {'path': ..., 'url': ..., 'commit': ...}
        self.project_infos = project_infos
        self.jobs = {}
        self.yaml = YAML()
        self.cached_data = None

    def parse(self):

        # Reset jobs
        self.jobs = {}
        self.cached_data = None # Invalidate cache
        
        for info in self.project_infos:
            self._parse_project_path(info)
                
        return self.jobs

    def _parse_project_path(self, project_info):
        project_path = project_info['path']
        if not os.path.exists(project_path):
            print(f"Warning: Path does not exist: {project_path}")
            return

        # Check for zuul.yaml or .zuul.yaml
        for filename in ['zuul.yaml', '.zuul.yaml']:
            file_path = os.path.join(project_path, filename)
            if os.path.exists(file_path):
                self._parse_file(file_path, project_info)

        # Check for zuul.d or .zuul.d directories
        for dirname in ['zuul.d', '.zuul.d']:
            dir_path = os.path.join(project_path, dirname)
            if os.path.exists(dir_path) and os.path.isdir(dir_path):
                self._parse_directory(dir_path, project_info)

    def _parse_directory(self, dir_path, project_info):
        for root, _, files in os.walk(dir_path):
            if '.zuul.ignore' in files:
                continue
            for file in files:
                if file.endswith('.yaml'):
                    self._parse_file(os.path.join(root, file), project_info)

    def _parse_file(self, file_path, project_info):
        try:
            with open(file_path, 'r') as f:
                data = self.yaml.load(f)
                if data:
                    for item in data:
                        if 'job' in item:
                            job = item['job']
                            
                            # Calculate relative path and git URL
                            repo_root = project_info['path']
                            relative_path = os.path.relpath(file_path, repo_root)
                            repo_url = project_info['url']
                            commit = project_info['commit']
                            
                            # Construct web URL
                            # Remove .git suffix if present
                            base_url = repo_url
                            if base_url.endswith('.git'):
                                base_url = base_url[:-4]
                            
                            # Determine URL format
                            # GitLab usually has /-/blob/, GitHub has /blob/
                            # Heuristic: if 'gitlab' in domain, use /-/blob/, else /blob/
                            if 'gitlab' in base_url:
                                blob_segment = '-/blob'
                            else:
                                blob_segment = 'blob'
                                
                            line_num = 1
                            if hasattr(job, 'lc') and job.lc.line is not None:
                                line_num = job.lc.line + 1
                                
                            source_url = f"{base_url}/{blob_segment}/{commit}/{relative_path}#L{line_num}"
                            
                            job['source_file'] = relative_path
                            job['source_line'] = line_num
                            
                            # Extract vars source locations
                            if 'vars' in job and isinstance(job['vars'], dict) and hasattr(job['vars'], 'lc'):
                                vars_source = {}
                                for var_name in job['vars']:
                                    try:
                                        # ruamel.yaml stores line info (line, col)
                                        # line is 0-indexed
                                        line_info = job['vars'].lc.item(var_name)
                                        if line_info:
                                            var_line = line_info[0] + 1
                                            var_url = f"{base_url}/{blob_segment}/{commit}/{relative_path}#L{var_line}"
                                            vars_source[var_name] = var_url
                                    except Exception as e:
                                        # If we can't get line info, just skip
                                        pass
                                job['vars_source'] = vars_source

                            job['source_path'] = file_path # Keep absolute path for internal use if needed, or remove
                            job['source_url'] = source_url
                                
                            self.jobs[job['name']] = job
        except Exception as e:
            print(f"Error parsing {file_path}: {e}")

    def _get_inherited_vars(self, job_name):
        inherited = []
        current_job = self.jobs.get(job_name)
        
        # Traverse up the hierarchy
        while current_job:
            parent_name = current_job.get('parent')
            if not parent_name:
                break
                
            parent_job = self.jobs.get(parent_name)
            if not parent_job:
                break
            
            # Check for vars
            vars = parent_job.get('vars')
            if vars:
                inherited.append({
                    'name': parent_name,
                    'vars': vars,
                    'vars_source': parent_job.get('vars_source', {})
                })
            
            current_job = parent_job
            
        return inherited

    def get_graph_data(self):
        if self.cached_data:
            return self.cached_data

        nodes = []
        edges = []
        
        for job_name, job in self.jobs.items():
            # Node
            nodes.append({
                'id': job_name,
                'data': { 
                    'label': job_name, 
                    'details': {
                        **job, 
                        'inherited_vars': self._get_inherited_vars(job_name)
                    } 
                }
            })
            
            # Edges from parent
            if job.get('parent'):
                edges.append({
                    'id': f"{job['parent']}-{job_name}",
                    'source': job['parent'],
                    'target': job_name,
                    'type': 'smoothstep',
                    'animated': False,
                })
            
            # Edges from dependencies
            deps = job.get('dependencies', [])
            if deps:
                for dep in deps:
                    # Dependencies can be strings or dicts
                    dep_name = dep if isinstance(dep, str) else dep.get('name')
                    if dep_name:
                        edges.append({
                            'id': f"{dep_name}-{job_name}",
                            'source': dep_name,
                            'target': job_name,
                            'type': 'smoothstep',
                            'animated': True,
                            'label': 'depends on'
                        })

        
        self.cached_data = {'nodes': nodes, 'edges': edges}
        return self.cached_data
