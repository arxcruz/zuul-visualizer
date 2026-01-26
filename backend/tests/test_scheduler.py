
import pytest
from unittest.mock import MagicMock, patch, call
from scheduler import JobScheduler

@pytest.fixture
def scheduler():
    with patch('scheduler.BackgroundScheduler') as MockScheduler:
        # Configure the mock instance that will be returned when class is instantiated
        mock_instance = MockScheduler.return_value
        
        config = {'doc_update_interval': 3600}
        project_infos = [{'path': '/tmp/repo1', 'url': 'git://repo1', 'commit': 'oldhash'}]
        callback = MagicMock()
        
        sched = JobScheduler(config, project_infos, on_update_callback=callback)
        # Attach the mock instance to the object for assertions if needed, 
        # though sched.scheduler is already it.
        return sched

def test_start(scheduler):
    # When we patch config, we get a Mock class.
    # Instantiate it to get the instance that the Scheduler class uses.
    # Actually, patch('scheduler.BackgroundScheduler') makes JobScheduler() create a MagicMock.
    
    scheduler.start()
    # The instance created inside __init__
    scheduler.scheduler.add_job.assert_called()
    scheduler.scheduler.start.assert_called_once()

@patch('scheduler.load_config')
@patch('subprocess.check_call')
@patch('subprocess.check_output')
@patch('os.path.exists')
@patch('os.path.isdir')
def test_update_repos_success(mock_isdir, mock_exists, mock_sub_output, mock_sub_call, mock_load_config, scheduler):
    # Setup
    mock_load_config.return_value = {'sources': ['git://repo1']} # Static source matches current
    mock_exists.return_value = True
    mock_isdir.return_value = True
    mock_sub_output.return_value = b'newhash\n'
    
    # Run
    scheduler.update_repos_and_docs()
    
    # Verify Git commands
    mock_sub_call.assert_any_call(['git', '-C', '/tmp/repo1', 'fetch', 'origin'])
    mock_sub_call.assert_any_call(['git', '-C', '/tmp/repo1', 'reset', '--hard', 'origin/HEAD'])
    
    # Verify commit update
    assert scheduler.project_infos[0]['commit'] == 'newhash'
    
    # Verify callback
    scheduler.on_update_callback.assert_called_once()

@patch('scheduler.load_config')
@patch('shutil.rmtree')
@patch('os.path.exists')
def test_cleanup_removed_repos(mock_exists, mock_rmtree, mock_load_config, scheduler):
    # Setup: config has NO sources, but we have one in project_infos
    mock_load_config.return_value = {'sources': []} 
    mock_exists.return_value = True
    
    # Run
    scheduler.update_repos_and_docs()
    
    # Verify removal
    mock_rmtree.assert_called_with('/tmp/repo1')
    assert len(scheduler.project_infos) == 0
    
    # Callback should still run if we cleaned up? Logic says it runs at end
    scheduler.on_update_callback.assert_called_once()
