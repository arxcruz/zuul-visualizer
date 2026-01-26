from apscheduler.schedulers.background import BackgroundScheduler
import subprocess
import os
import hashlib
import traceback
import shutil
from ai_utils import load_config

class JobScheduler:
    def __init__(self, app_config, project_infos, on_update_callback=None):
        self.config = app_config
        self.project_infos = project_infos # Reference to mutable list from app.py
        self.scheduler = BackgroundScheduler()
        self.on_update_callback = on_update_callback
    
    def start(self):
        interval = self.config.get('doc_update_interval', 86400)
        self.scheduler.add_job(
            self.update_repos_and_docs, 
            'interval', 
            seconds=interval, 
            id='doc_update_job'
        )
        self.scheduler.start()
        print(f"Scheduler started with interval {interval}s")

        # Run once on startup in background (small delay to let app start)
        self.scheduler.add_job(self.update_repos_and_docs, 'date', run_date=None, id='startup_job')

    def shutdown(self):
        self.scheduler.shutdown()

    def force_run(self):
        """Manually trigger the update job"""
        job = self.scheduler.get_job('doc_update_job')
        if job:
            job.modify(next_run_time=None) # Trigger immediately
        else:
            self.scheduler.add_job(self.update_repos_and_docs, 'date', run_date=None)
        return True

    def update_repos_and_docs(self):
        print("Starting repository and documentation update...")
        try:
            # Load config to check for static repos
            fresh_config = load_config()
            static_sources = fresh_config.get('sources', fresh_config.get('source')) or []
            if isinstance(static_sources, str):
                static_sources = [static_sources]
            static_urls = set(static_sources)

            # 1. Update Repositories
            # We iterate over a copy of the list because we might remove items
            for info in self.project_infos[:]:
                url = info.get('url')
                target_path = info['path']
                
                # Check for cleanup
                if url not in static_urls:
                     print(f"Cleaning up temporary repo: {target_path}")
                     try:
                         if os.path.exists(target_path):
                             shutil.rmtree(target_path)
                         self.project_infos.remove(info)
                         continue # Skip update since we deleted it
                     except Exception as e:
                         print(f"Failed to delete {target_path}: {e}")

                if os.path.exists(target_path) and os.path.isdir(os.path.join(target_path, '.git')):
                    print(f"Updating {target_path}...")
                    try:
                        # Use fetch/reset --hard to ensure we mirror remote exactly and avoid rebase issues
                        subprocess.check_call(['git', '-C', target_path, 'fetch', 'origin'])
                        # Determine default branch (usually HEAD refers to it on remote)
                        subprocess.check_call(['git', '-C', target_path, 'reset', '--hard', 'origin/HEAD'])
                        
                        # Update commit hash
                        commit_hash = subprocess.check_output(['git', '-C', target_path, 'rev-parse', 'HEAD']).decode('utf-8').strip()
                        info['commit'] = commit_hash # Update in place
                        
                    except subprocess.CalledProcessError as e:
                        print(f"Failed to update {target_path}: {e}")
            
            # 2. Generate Documentation
            # 2. Generate Documentation
            # Documentation generation removed as per request
                
            
            # 3. Refresh Parser Cache
            if self.on_update_callback:
                print("Triggering cache refresh...")
                try:
                    self.on_update_callback()
                except Exception as e:
                     print(f"Error in refresh callback: {e}")

            print("Update completed successfully.")
            
        except Exception as e:
            print(f"Error in update job: {e}")
            traceback.print_exc()
