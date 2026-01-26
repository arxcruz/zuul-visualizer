
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import { vi } from 'vitest';
import axios from 'axios';

// Mock axios
vi.mock('axios');

// Mock ReactFlow to avoid canvas issues in testing
vi.mock('reactflow', async () => {
    const actual = await vi.importActual('reactflow');
    return {
        ...actual,
        ReactFlow: ({ children }) => <div>MockReactFlow {children}</div>,
        Background: () => <div>MockBackground</div>,
        Controls: () => <div>MockControls</div>,
        MiniMap: () => <div>MockMiniMap</div>,
    };
});

describe('App', () => {
    beforeEach(() => {
        axios.get.mockReset();
        // Mock initial graph fetch
        axios.get.mockResolvedValue({
            data: { nodes: [], edges: [] }
        });
    });

    test('renders without crashing', async () => {
        render(<App />);
        // Check for static elements like the sidebar title or search placeholder
        expect(screen.getByPlaceholderText(/Search/i)).toBeInTheDocument();
    });

    test('fetches graph data on mount', async () => {
        render(<App />);
        await waitFor(() => {
            expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/api/graph'));
        });
    });
});
