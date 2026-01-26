
import sys
import unittest
from unittest.mock import MagicMock
sys.path.append('.') # Ensure backend is in path

from scheduler import JobScheduler

class TestScheduler(unittest.TestCase):
    def test_auto_generate_docs_disabled(self):
        print("Testing auto_generate_docs: False")
        config = {'enable_ai': True, 'auto_generate_docs': False}
        project_infos = [{'path': 'dummy'}]
        scheduler = JobScheduler(config, project_infos)
        
        # Mock dependencies
        scheduler.doc_gen = MagicMock()
        scheduler.doc_gen.generate = MagicMock()
        
        # Mock internal methods to avoid actual git/network ops
        # We only care about doc_gen.generate call
        # But update_repos_and_docs does git operations first.
        # We should mock subprocess to avoid git errors
        import subprocess
        subprocess.check_call = MagicMock()
        subprocess.check_output = MagicMock(return_value=b'hash')
        import os
        os.path.exists = MagicMock(return_value=True) # Pretend git repo exists
        os.path.isdir = MagicMock(return_value=True)

        scheduler.update_repos_and_docs()
        
        scheduler.doc_gen.generate.assert_not_called()
        print("PASS: generate() was not called when auto_generate_docs is False")

    def test_auto_generate_docs_enabled(self):
        print("Testing auto_generate_docs: True")
        config = {'enable_ai': True, 'auto_generate_docs': True}
        project_infos = [{'path': 'dummy'}]
        scheduler = JobScheduler(config, project_infos)
        
        # Mock dependencies
        scheduler.doc_gen = MagicMock()
        scheduler.doc_gen.generate = MagicMock()
        
        import subprocess
        subprocess.check_call = MagicMock()
        subprocess.check_output = MagicMock(return_value=b'hash')
        import os
        os.path.exists = MagicMock(return_value=True)
        os.path.isdir = MagicMock(return_value=True)

        scheduler.update_repos_and_docs()
        
        scheduler.doc_gen.generate.assert_called_once()
        print("PASS: generate() was called when auto_generate_docs is True")

if __name__ == '__main__':
    unittest.main()
