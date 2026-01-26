
import pytest
from unittest.mock import MagicMock, patch
import app

@pytest.fixture
def client():
    app.app.config['TESTING'] = True
    with app.app.test_client() as client:
        yield client

@patch('app.parser')
def test_get_graph(mock_parser, client):
    mock_data = {'nodes': [], 'edges': []}
    mock_parser.get_graph_data.return_value = mock_data
    
    rv = client.get('/api/graph')
    assert rv.status_code == 200
    assert rv.json == mock_data

@patch('app.parser')
@patch('app.resolve_project_paths')
def test_load_repo_validation(mock_resolve, mock_parser, client):
    # Test missing URL
    rv = client.post('/api/load-repo', json={})
    assert rv.status_code == 400
    assert 'error' in rv.json
    
    # Test resolution failure
    mock_resolve.return_value = ([], "Some error")
    rv = client.post('/api/load-repo', json={'url': 'bad-url'})
    assert rv.status_code == 400
    assert 'Failed to resolve' in rv.json['error']

@patch('app.parser')
@patch('app.resolve_project_paths')
@patch('app.scheduler')
def test_load_repo_success(mock_scheduler, mock_resolve, mock_parser, client):
    mock_resolve.return_value = ([{'path': '/tmp', 'url': 'git://foo', 'commit': 'HEAD'}], None)
    mock_parser.project_infos = []
    
    rv = client.post('/api/load-repo', json={'url': 'git://foo'})
    assert rv.status_code == 200
    assert 'successfully' in rv.json['message']
    
    # Verify it was added to parser and scheduler
    assert len(mock_parser.project_infos) == 1
