import React, { useState, useEffect, useCallback } from 'react';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import axios from 'axios';
import dagre from 'dagre';
import { Send, MessageSquare, Info, Copy, X, Settings, Grid, Layout, Palette, RotateCcw, ChevronDown, ChevronRight, List, Share2, ArrowRight, ArrowDown } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5001/api';

const NODE_STYLES = {
  small: { width: 180, fontSize: '12px', spacingX: 250, spacingY: 100 },
  medium: { width: 250, fontSize: '14px', spacingX: 350, spacingY: 150 },
  big: { width: 350, fontSize: '16px', spacingX: 450, spacingY: 200 },
};

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [originalNodes, setOriginalNodes] = useState([]);
  const [originalEdges, setOriginalEdges] = useState([]);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [selectedJob, setSelectedJob] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [showBackground, setShowBackground] = useState(true);
  const [nodeSize, setNodeSize] = useState('medium');
  const [isRepoModalOpen, setIsRepoModalOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoHistory, setRepoHistory] = useState(() => {
    // History is now client-side
    const saved = localStorage.getItem('zuul-repo-history');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeRepos, setActiveRepos] = useState([]);
  const [aiEnabled, setAiEnabled] = useState(false);

  // Descendant Highlighting
  const [highlightedDescendants, setHighlightedDescendants] = useState(new Set());
  const [showDescendantList, setShowDescendantList] = useState(false);
  const [layoutMode, setLayoutMode] = useState('grid'); // 'grid' | 'tree'
  const [layoutDirection, setLayoutDirection] = useState('TB'); // 'TB' | 'LR'

  // Color configuration
  const DEFAULT_COLORS = {
    job: { bg: '#ffffff', text: '#1f2937', border: '#e5e7eb' },
    selected: { bg: '#eef2ff', text: '#1f2937', border: '#4f46e5' },
    parent: { bg: '#fff7ed', text: '#1f2937', border: '#f97316' },
    final: { bg: '#ecfdf5', text: '#1f2937', border: '#10b981' },
    descendant: { bg: '#fdf4ff', text: '#1f2937', border: '#d946ef' }, // Fuchsia-500
  };
  const [colorConfig, setColorConfig] = useState(() => {
    const saved = localStorage.getItem('zuul-theme');
    return saved ? JSON.parse(saved) : DEFAULT_COLORS;
  });

  useEffect(() => {
    localStorage.setItem('zuul-theme', JSON.stringify(colorConfig));
  }, [colorConfig]);

  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);

  const resetColors = () => setColorConfig(DEFAULT_COLORS);

  // Fetch Graph Data
  const fetchGraph = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/graph`);

      const { nodes: apiNodes, edges: apiEdges } = res.data;

      // Simple layouting
      // Note: We use a default sidebar width here as it might not be fully initialized or we want a default view
      const defaultSidebarWidth = 384;
      const availableWidth = window.innerWidth - defaultSidebarWidth - 100;
      const spacingX = 250;
      const columns = Math.max(1, Math.floor(availableWidth / spacingX));

      const layoutedNodes = apiNodes.map((node, index) => ({
        ...node,
        position: { x: 100 + (index % columns) * 250, y: 100 + Math.floor(index / columns) * 150 }
      }));

      // Set original data
      setOriginalNodes(layoutedNodes);
      setOriginalEdges(apiEdges);

      // Initialize view
      setNodes(layoutedNodes);
      setEdges(apiEdges);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching graph", error);
      setLoading(false);
    }
  }, [setNodes, setEdges]);

  useEffect(() => {
    fetchGraph();
    checkSystemStatus();
  }, [fetchGraph]);

  const checkSystemStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE}/system/status`);
      setAiEnabled(res.data.ai_enabled);
    } catch (err) {
      console.error("Error checking system status", err);
      setAiEnabled(false);
    }
  };

  const getLayoutedElements = useCallback((nodes, edges, direction = 'LR') => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    // Check node dimensions based on current size setting
    const { width } = NODE_STYLES[nodeSize];
    const height = 50; // Approximated height

    dagreGraph.setGraph({ rankdir: direction, nodesep: 50, ranksep: 50 });

    nodes.forEach((node) => {
      dagreGraph.setNode(node.id, { width, height });
    });

    edges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);

      // We are shifting the dagre node position (anchor=center center) to the top left
      // so it matches the React Flow node anchor point (top left).
      return {
        ...node,
        targetPosition: direction === 'LR' ? 'left' : 'top',
        sourcePosition: direction === 'LR' ? 'right' : 'bottom',
        position: {
          x: nodeWithPosition.x - width / 2,
          y: nodeWithPosition.y - height / 2,
        },
        style: { ...node.style, width, fontSize: NODE_STYLES[nodeSize].fontSize },
      };
    });

    return { nodes: layoutedNodes, edges };
  }, [nodeSize]);

  const handleJobClick = (jobName) => {
    const jobNode = originalNodes.find(n => n.data.details.name === jobName);
    if (jobNode) {
      setSelectedJob(jobNode.data.details);
    }
  };

  const onNodeClick = useCallback((event, node) => {
    // ... existing onNodeClick
    setSelectedJob(node.data.details);
    setChatHistory([]);
    setHighlightedDescendants(new Set()); // Reset on new selection
    setShowDescendantList(false);
  }, []);

  const toggleDescendantHighlight = () => {
    if (!selectedJob) return;

    // Toggle off
    if (highlightedDescendants.size > 0) {
      setHighlightedDescendants(new Set());
      setShowDescendantList(false);
      return;
    }

    // Find all descendants
    const descendants = new Set();
    const queue = [selectedJob.name];

    // Create a map for faster lookup if needed, but iterating edges is okay for now
    // We need to look at edges where source is the current node

    const findChildren = (parentName) => {
      const children = originalEdges
        .filter(e => e.source === parentName)
        .map(e => e.target);

      children.forEach(child => {
        if (!descendants.has(child)) {
          descendants.add(child);
          findChildren(child); // Recurse
        }
      });
    };

    findChildren(selectedJob.name);
    setHighlightedDescendants(descendants);
    setShowDescendantList(true);
    setSearchQuery(''); // Update: Clear search when entering descendant mode
  };

  // ...



  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const question = chatInput;
    const currentHistory = [...chatHistory, { type: 'user', text: question }];
    setChatHistory(currentHistory);
    setChatInput('');

    try {
      const res = await axios.post(`${API_BASE}/chat`, {
        question,
        jobName: selectedJob?.name
      });
      setChatHistory([...currentHistory, { type: 'bot', text: res.data.answer }]);
    } catch (err) {
      console.error(err);
      setChatHistory([...currentHistory, { type: 'bot', text: "Error connecting to AI." }]);
    }
  };

  const copyVariable = (key, value) => {
    const textToCopy = `${key}: ${typeof value === 'object' && value !== null ? JSON.stringify(value, null, 2) : value}`;
    navigator.clipboard.writeText(textToCopy);
    // Optional: Could add a toast here
  };

  const [sidebarWidth, setSidebarWidth] = useState(384); // Default 384px
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback(() => setIsResizing(true), []);
  const stopResizing = useCallback(() => setIsResizing(false), []);
  const resize = useCallback((mouseMoveEvent) => {
    if (isResizing) {
      const newWidth = window.innerWidth - mouseMoveEvent.clientX;
      if (newWidth > 250 && newWidth < window.innerWidth - 300) {
        setSidebarWidth(newWidth);
      }
    }
  }, [isResizing]);

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  const handleLoadRepo = async (eUrl) => {
    // Check if called from event or direct URL
    const urlToLoad = typeof eUrl === 'string' ? eUrl : repoUrl;

    if (typeof eUrl !== 'string') eUrl.preventDefault();
    if (!urlToLoad.trim()) return;

    setRepoLoading(true);
    try {
      await axios.post(`${API_BASE}/load-repo`, { url: urlToLoad });
      await fetchGraph(); // Refresh graph data
      setIsRepoModalOpen(false);
      setRepoUrl('');
      addToHistory(urlToLoad);
      // Optional: Show success message/toast
    } catch (err) {
      console.error(err);
      alert('Failed to load repository: ' + (err.response?.data?.error || err.message));
    } finally {
      setRepoLoading(false);
    }
  };

  const addToHistory = (url) => {
    setRepoHistory(prev => {
      // Remove if exists to move to top
      const filtered = prev.filter(item => item.url !== url);
      const newItem = {
        url,
        date: new Date().toLocaleString()
      };
      const newHistory = [newItem, ...filtered].slice(0, 10);
      localStorage.setItem('zuul-repo-history', JSON.stringify(newHistory));
      return newHistory;
    });
  };

  useEffect(() => {
    if (isRepoModalOpen) {
      axios.get(`${API_BASE}/repos`)
        .then(res => {
          // res.data.active comes from backend
          // res.data.history is no longer used/returned
          setActiveRepos(res.data.active);
        })
        .catch(err => console.error("Error fetching repo history", err));
    }
  }, [isRepoModalOpen]);

  const handleClear = async () => {
    try {
      await axios.post(`${API_BASE}/clear`);
      await fetchGraph();
      setSelectedJob(null);
      setSearchQuery('');
      setChatHistory([]);
    } catch (err) {
      console.error("Error clearing graph", err);
    }
  };

  // Handle Filtering, Layout, and Styling
  useEffect(() => {
    if (originalNodes.length === 0) return;

    let newNodes = [];
    let newEdges = [];

    const { width, fontSize, spacingX, spacingY } = NODE_STYLES[nodeSize];

    if (!searchQuery && highlightedDescendants.size === 0) {
      if (layoutMode === 'tree') {
        // Tree layout for all nodes
        // Need to ensure nodes have dimensions for dagre
        const nodesForDagre = originalNodes.map(node => ({
          ...node,
          style: { ...node.style, width, fontSize }
        }));
        // FIX: Pass originalEdges instead of newEdges (which was empty)
        const layouted = getLayoutedElements(nodesForDagre, originalEdges, layoutDirection);
        newNodes = layouted.nodes;
        newEdges = layouted.edges;
      } else {
        // Grid layout
        const availableWidth = windowSize.width - sidebarWidth - 100;
        const columns = Math.max(1, Math.floor(availableWidth / spacingX));

        newNodes = originalNodes.map((node, index) => ({
          ...node,
          style: { ...node.style, width, fontSize },
          sourcePosition: undefined,
          targetPosition: undefined,
          position: {
            x: 100 + (index % columns) * spacingX,
            y: 100 + Math.floor(index / columns) * spacingY
          }
        }));
        newEdges = originalEdges;
      }
    } else {
      // Filter (Search OR Descendants view)
      const filteredRaw = originalNodes.filter(node => {
        if (highlightedDescendants.size > 0 && selectedJob) {
          // Descendant View Mode: Show Parent + Descendants
          const isSelected = node.id === selectedJob.name;
          const isDescendant = highlightedDescendants.has(node.id);
          return isSelected || isDescendant;
        } else {
          // Search Mode
          const matchesSearch = node.id.toLowerCase().includes(searchQuery.toLowerCase());
          const isSelected = selectedJob && node.id === selectedJob.name;
          const isParentOfSelected = selectedJob && selectedJob.parent && node.id === selectedJob.parent;
          return matchesSearch || isSelected || isParentOfSelected;
        }
      });

      // Filter Edges First
      const filteredEdges = originalEdges.filter(edge => {
        const sourceExists = filteredRaw.some(n => n.id === edge.source);
        const targetExists = filteredRaw.some(n => n.id === edge.target);
        return sourceExists && targetExists;
      });

      if (layoutMode === 'tree') {
        // Prepare nodes for dagre
        const nodesForDagre = filteredRaw.map(node => ({
          ...node,
          style: { ...node.style, width, fontSize }
        }));
        const layouted = getLayoutedElements(nodesForDagre, filteredEdges, layoutDirection);
        newNodes = layouted.nodes;
        newEdges = layouted.edges;
      } else {
        // Grid Layout
        // Compact Layout for filtered results
        const availableWidth = windowSize.width - sidebarWidth - 100;
        const columns = Math.max(1, Math.floor(availableWidth / spacingX));

        newNodes = filteredRaw.map((node, index) => ({
          ...node,
          style: { ...node.style, width, fontSize },
          sourcePosition: undefined,
          targetPosition: undefined,
          position: {
            x: 100 + (index % columns) * spacingX,
            y: 100 + Math.floor(index / columns) * spacingY
          }
        }));
        newEdges = filteredEdges;
      }
    }

    // Apply Leaf Styling (Global) - using colorConfig
    const parentIds = new Set(originalEdges.map(e => e.source));
    newNodes = newNodes.map(node => {
      // Default Style for all nodes first
      let style = {
        ...node.style,
        backgroundColor: colorConfig.job.bg,
        color: colorConfig.job.text,
        borderColor: colorConfig.job.border,
      };

      const isLeaf = !parentIds.has(node.id);
      if (isLeaf) {
        style = {
          ...style,
          backgroundColor: colorConfig.final.bg,
          color: colorConfig.final.text,
          borderColor: colorConfig.final.border,
          borderWidth: '2px',
          borderStyle: 'solid'
        };
      }
      return { ...node, style };
    });

    // Apply Highlighting
    if (selectedJob) {
      newNodes = newNodes.map(node => {
        const isSelected = node.id === selectedJob.name;
        const isParentOfSelected = selectedJob && selectedJob.parent && node.id === selectedJob.parent;
        const isDescendant = highlightedDescendants.has(node.id);

        if (isSelected) {
          return {
            ...node,
            style: {
              ...node.style,
              backgroundColor: colorConfig.selected.bg,
              color: colorConfig.selected.text,
              borderColor: colorConfig.selected.border,
              borderWidth: '2px',
              borderStyle: 'solid',
              boxShadow: `0 0 10px ${colorConfig.selected.border}80`, // Add opacity to shadow
            }
          };
        } else if (isParentOfSelected) {
          return {
            ...node,
            style: {
              ...node.style,
              backgroundColor: colorConfig.parent.bg,
              color: colorConfig.parent.text,
              borderColor: colorConfig.parent.border,
              borderWidth: '2px',
              borderStyle: 'solid',
              boxShadow: `0 0 10px ${colorConfig.parent.border}80`,
            }
          };
        } else if (isDescendant) {
          return {
            ...node,
            style: {
              ...node.style,
              backgroundColor: colorConfig.descendant.bg,
              color: colorConfig.descendant.text,
              borderColor: colorConfig.descendant.border,
              borderWidth: '2px',
              borderStyle: 'solid',
              boxShadow: `0 0 10px ${colorConfig.descendant.border}60`,
            }
          };
        }
        return node;
      });

      // Highlight Edge connecting Parent -> Job (keep using selected border color for edge)
      newEdges = newEdges.map(edge => {
        const isParentEdge = selectedJob.parent && edge.source === selectedJob.parent && edge.target === selectedJob.name;
        // Also highlight edges between highlighted descendants if both source and target are in the set
        // OR if source is selectedJob and target is a descendant
        const isDescendantEdge = (highlightedDescendants.has(edge.source) || edge.source === selectedJob.name) && highlightedDescendants.has(edge.target);

        if (isParentEdge) {
          return {
            ...edge,
            style: { ...edge.style, stroke: colorConfig.selected.border, strokeWidth: 3 },
            animated: true
          };
        } else if (isDescendantEdge) {
          return {
            ...edge,
            style: { ...edge.style, stroke: colorConfig.descendant.border, strokeWidth: 2 },
            animated: true
          };
        }
        return edge;
      });
    }

    setNodes(newNodes);
    setEdges(newEdges);

  }, [searchQuery, originalNodes, originalEdges, windowSize, selectedJob, sidebarWidth, nodeSize, setNodes, setEdges, colorConfig, highlightedDescendants, layoutMode, getLayoutedElements, layoutDirection]);

  // Auto-Zoom to selected node
  useEffect(() => {
    if (selectedJob && reactFlowInstance && nodes.length > 0) {
      const node = nodes.find(n => n.id === selectedJob.name);
      if (node) {
        // Fit view to the specific node with some padding and animation
        reactFlowInstance.fitView({
          nodes: [{ id: selectedJob.name }],
          padding: 0.5,
          duration: 1000,
          maxZoom: 1.5 // Don't zoom in *too* much
        });
      }
    }
  }, [selectedJob, reactFlowInstance, nodes]); // nodes might change with filtering

  return (
    <div className="flex h-screen w-full bg-gray-50">
      {/* Visualizer Area */}
      <div className="grow h-full relative flex flex-col">
        {/* Top Toolbar */}
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between shadow-xs z-10">
          <div className="flex items-center gap-2">
            <Layout className="text-indigo-600" size={20} />
            <span className="font-semibold text-gray-700">Graph View</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowBackground(!showBackground)}
              className={`p-1.5 rounded-md transition-colors ${showBackground ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
              title="Toggle Background Grid"
            >
              <Grid size={18} />
            </button>
            <div className="h-4 w-px bg-gray-300 mx-1"></div>

            <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-sm px-2 py-1.5 shadow-xs">
              <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                <Settings size={14} /> Size:
              </span>
              <select
                value={nodeSize}
                onChange={(e) => setNodeSize(e.target.value)}
                className="text-sm text-gray-700 bg-transparent border-none focus:ring-0 cursor-pointer outline-hidden"
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="big">Big</option>
              </select>
            </div>

            <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-sm px-2 py-1.5 shadow-xs">
              <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                <Layout size={14} /> Layout:
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setLayoutMode('grid')}
                  className={`p-1 rounded-sm ${layoutMode === 'grid' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'}`}
                  title="Grid View"
                >
                  <Grid size={16} />
                </button>
                <button
                  onClick={() => setLayoutMode('tree')}
                  className={`p-1 rounded-sm ${layoutMode === 'tree' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'}`}
                  title="Tree View"
                >
                  <Share2 size={16} style={{ transform: 'rotate(90deg)' }} />
                </button>
                {layoutMode === 'tree' && (
                  <>
                    <div className="h-4 w-px bg-gray-300 mx-1"></div>
                    <button
                      onClick={() => setLayoutDirection(d => d === 'TB' ? 'LR' : 'TB')}
                      className="p-1 rounded-sm text-gray-500 hover:bg-gray-100"
                      title={layoutDirection === 'TB' ? "Switch to Horizontal Layout" : "Switch to Vertical Layout"}
                    >
                      {layoutDirection === 'TB' ? <ArrowDown size={16} /> : <ArrowRight size={16} />}
                    </button>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={() => setIsThemeModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-sm text-sm font-medium hover:bg-gray-50 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-xs"
            >
              <Palette size={16} /> Theme
            </button>
            <button
              onClick={() => setIsRepoModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-sm text-sm font-medium hover:bg-indigo-700 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-xs"
            >
              Load Repo
            </button>

            <div className="h-4 w-px bg-gray-300 mx-1"></div>
            <button
              onClick={handleClear}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-sm text-sm font-medium hover:bg-red-100 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors shadow-xs"
              title="Clear Graph"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="grow relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onInit={setReactFlowInstance}
            fitView
          >
            {showBackground && <Background />}
            <Controls />
          </ReactFlow>

          {/* Legend */}
          <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-xs p-3 rounded-lg shadow-md border border-gray-200 z-10 text-xs">
            <h4 className="font-semibold mb-2 text-gray-800">Legend</h4>
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="w-3 h-3 rounded-sm box-border"
                style={{ backgroundColor: colorConfig.selected.bg, border: `2px solid ${colorConfig.selected.border}` }}
              ></span>
              <span className="text-gray-600">Selected Job</span>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="w-3 h-3 rounded-sm box-border"
                style={{ backgroundColor: colorConfig.parent.bg, border: `2px solid ${colorConfig.parent.border}` }}
              ></span>
              <span className="text-gray-600">Parent Job</span>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="w-3 h-3 rounded-sm box-border"
                style={{ backgroundColor: colorConfig.descendant.bg, border: `2px solid ${colorConfig.descendant.border}` }}
              ></span>
              <span className="text-gray-600">Descendant Job</span>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="w-3 h-3 rounded-sm box-border"
                style={{ backgroundColor: colorConfig.final.bg, border: `2px solid ${colorConfig.final.border}` }}
              ></span>
              <span className="text-gray-600">Final Job</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-sm box-border"
                style={{ backgroundColor: colorConfig.job.bg, border: `1px solid ${colorConfig.job.border}` }}
              ></span>
              <span className="text-gray-600">Job</span>
            </div>
          </div>
        </div>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
            Loading...
          </div>
        )}

        {/* Floating Chat Button */}
        {aiEnabled && (
          <button
            onClick={() => setIsChatOpen(true)}
            className="absolute bottom-6 right-6 bg-indigo-600 text-white p-4 rounded-full shadow-lg hover:bg-indigo-700 transition-all z-20 flex items-center gap-2"
          >
            <MessageSquare size={24} />
            {/* <span className="font-semibold">Ask AI</span> */}
          </button>
        )}
      </div>

      {/* Sidebar */}
      {/* Sidebar */}
      <div
        className="bg-white border-l border-gray-200 flex flex-col shadow-xl relative"
        style={{ width: sidebarWidth }}
      >
        {/* Resize Handle */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-600 transition-colors z-50 transform -translate-x-1/2"
          onMouseDown={startResizing}
        />
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-indigo-600 text-white">
          <h1 className="text-xl font-bold mb-4">Zuul Visualizer</h1>
          <input
            type="text"
            placeholder="Search jobs..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value) {
                setHighlightedDescendants(new Set());
                setShowDescendantList(false);
              }
            }}
            className="w-full px-3 py-2 rounded-sm bg-white text-gray-900 placeholder-gray-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-400"
          />

        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 border-b border-gray-200">
          {selectedJob ? (
            <div>
              <button
                onClick={() => setSelectedJob(null)}
                className="mb-4 text-sm text-indigo-600 hover:text-indigo-800 flex items-center hover:underline"
              >
                &larr; Back to List
              </button>
              <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
                <Info size={20} />
                {selectedJob.name}
              </h2>
              {selectedJob.description && (
                <p className="text-gray-600 mb-4">{selectedJob.description}</p>
              )}

              <div className="space-y-4">
                <div>
                  <span className="font-semibold text-sm text-gray-500 uppercase">Defined in</span>
                  <div className="mt-1 font-mono text-sm bg-gray-100 p-2 rounded-sm break-all">
                    {selectedJob.source_file ? (
                      <div>
                        {selectedJob.source_url ? (
                          <a
                            href={selectedJob.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 group"
                          >
                            <span>{selectedJob.source_file}:{selectedJob.source_line}</span>
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                              ↗
                            </span>
                          </a>
                        ) : (
                          <span>{selectedJob.source_file}:{selectedJob.source_line}</span>
                        )}
                        {/* <div className="text-xs text-gray-400 mt-1">{selectedJob.source_path}</div> */}
                      </div>
                    ) : (
                      <span className="text-gray-400 italic">Unknown location</span>
                    )}
                  </div>
                </div>

                <div>
                  <span className="font-semibold text-sm text-gray-500 uppercase">Parent</span>
                  <div className="mt-1 font-mono text-sm bg-gray-100 p-2 rounded-sm">
                    {selectedJob.parent ? (
                      <button
                        onClick={() => handleJobClick(selectedJob.parent)}
                        className="text-indigo-600 hover:text-indigo-800 hover:underline text-left"
                      >
                        {selectedJob.parent}
                      </button>
                    ) : 'None'}
                  </div>
                </div>

                {/* Descendant Highlighting & List */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm text-gray-500 uppercase">Descendants</span>
                    <button
                      onClick={toggleDescendantHighlight}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${highlightedDescendants.size > 0
                        ? 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 hover:bg-fuchsia-100'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    >
                      {highlightedDescendants.size > 0 ? 'Hide Descendants' : 'Highlight Descendants'}
                    </button>
                  </div>

                  {highlightedDescendants.size > 0 && (
                    <div className="bg-gray-50 rounded-sm border border-gray-200 overflow-hidden">
                      <button
                        onClick={() => setShowDescendantList(!showDescendantList)}
                        className="w-full flex items-center justify-between p-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <List size={14} />
                          <span>Child Jobs ({highlightedDescendants.size})</span>
                        </div>
                        {showDescendantList ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>

                      {showDescendantList && (
                        <div className="max-h-60 overflow-y-auto border-t border-gray-200 p-1">
                          {Array.from(highlightedDescendants).sort().map(childName => (
                            <button
                              key={childName}
                              onClick={() => handleJobClick(childName)}
                              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-sm transition-colors truncate"
                              title={childName}
                            >
                              {childName}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Pre/Post Run & Projects */}
                {['pre-run', 'post-run', 'run'].map(key => {
                  const data = selectedJob[key];
                  if (!data) return null;
                  const items = Array.isArray(data) ? data : [data];

                  const handleCopyAll = () => {
                    const textToCopy = items.map(item => {
                      const text = typeof item === 'object' ? item.name : item;
                      return `- ${text}`;
                    }).join('\n');
                    navigator.clipboard.writeText(textToCopy);
                  };

                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-gray-500 uppercase">{key.replace('-', ' ')}</span>
                        <button
                          onClick={handleCopyAll}
                          className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1"
                          title="Copy all as list"
                        >
                          <Copy size={12} /> Copy All
                        </button>
                      </div>
                      <div className="mt-1 bg-gray-50 p-2 rounded-sm border border-gray-100 font-mono text-sm">
                        <ul className="list-disc list-inside space-y-1">
                          {items.map((item, i) => {
                            const text = typeof item === 'object' ? item.name : item;
                            return (
                              <li key={i} className="flex items-start justify-between gap-2 break-all">
                                <span>{text}</span>
                                <button
                                  onClick={() => navigator.clipboard.writeText(text)}
                                  className="text-gray-400 hover:text-indigo-600 transition-colors p-1 shrink-0"
                                  title="Copy"
                                >
                                  <Copy size={12} />
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>
                  );
                })}

                {selectedJob['required-projects'] && (() => {
                  const projects = selectedJob['required-projects'];
                  const handleCopyAllProjects = () => {
                    const textToCopy = projects.map(proj => `- ${proj.name}`).join('\n');
                    navigator.clipboard.writeText(textToCopy);
                  };

                  return (
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-gray-500 uppercase">Projects</span>
                        <button
                          onClick={handleCopyAllProjects}
                          className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1"
                          title="Copy all as list"
                        >
                          <Copy size={12} /> Copy All
                        </button>
                      </div>
                      <div className="mt-1 bg-gray-50 p-2 rounded-sm border border-gray-100 font-mono text-sm">
                        <ul className="list-disc list-inside space-y-1">
                          {projects.map((proj, i) => (
                            <li key={i} className="flex items-start justify-between gap-2 break-all">
                              <div className="flex flex-col">
                                <span>{proj.name}</span>
                                {proj['override-checkout'] && <span className="text-gray-400 text-xs">({proj['override-checkout']})</span>}
                              </div>
                              <button
                                onClick={() => navigator.clipboard.writeText(proj.name)}
                                className="text-gray-400 hover:text-indigo-600 transition-colors p-1 shrink-0"
                                title="Copy project name"
                              >
                                <Copy size={12} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  );
                })()}

                {selectedJob.vars && (
                  <div>
                    <span className="font-semibold text-sm text-gray-500 uppercase">Variables</span>
                    <div className="mt-2 space-y-2">
                      {Object.entries(selectedJob.vars).map(([key, value]) => (
                        <div key={key} className="bg-gray-50 p-2 rounded-sm border border-gray-200">
                          <div className="flex items-center justify-between mb-1">
                            {selectedJob.vars_source && selectedJob.vars_source[key] ? (
                              <a
                                href={selectedJob.vars_source[key]}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-indigo-700 text-sm hover:underline hover:text-indigo-900"
                                title={`View definition of ${key} in source`}
                              >
                                {key} ↗
                              </a>
                            ) : (
                              <div className="font-medium text-indigo-700 text-sm">{key}</div>
                            )}
                            <button
                              onClick={() => copyVariable(key, value)}
                              className="text-gray-400 hover:text-indigo-600 transition-colors p-1"
                              title="Copy variable"
                            >
                              <Copy size={12} />
                            </button>
                          </div>
                          <div className="text-xs text-gray-800 font-mono break-all whitespace-pre-wrap">
                            {typeof value === 'object' && value !== null
                              ? JSON.stringify(value, null, 2)
                              : String(value)
                            }
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Inherited Variables */}
                {selectedJob.inherited_vars && selectedJob.inherited_vars.length > 0 && (
                  <div>
                    <span className="font-semibold text-sm text-gray-500 uppercase">Inherited Variables</span>
                    <div className="mt-2 space-y-4">
                      {selectedJob.inherited_vars.map((ancestor, idx) => (
                        <div key={idx} className="border-l-2 border-orange-200 pl-3">
                          <div className="text-xs text-orange-600 font-medium mb-2 flex items-center gap-1">
                            From
                            <button
                              onClick={() => handleJobClick(ancestor.name)}
                              className="font-mono bg-orange-50 px-1 rounded-sm hover:underline hover:text-orange-800 cursor-pointer border border-transparent hover:border-orange-200 transition-colors"
                              title={`Go to job ${ancestor.name}`}
                            >
                              {ancestor.name}
                            </button>
                          </div>
                          <div className="space-y-2">
                            {Object.entries(ancestor.vars).map(([key, value]) => (
                              <div key={key} className="bg-gray-50 p-2 rounded-sm border border-gray-200">
                                <div className="flex items-center justify-between mb-1">
                                  {ancestor.vars_source && ancestor.vars_source[key] ? (
                                    <a
                                      href={ancestor.vars_source[key]}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-medium text-indigo-700 text-sm hover:underline hover:text-indigo-900"
                                      title={`View definition of ${key} in source`}
                                    >
                                      {key} ↗
                                    </a>
                                  ) : (
                                    <div className="font-medium text-indigo-700 text-sm">{key}</div>
                                  )}
                                  <button
                                    onClick={() => copyVariable(key, value)}
                                    className="text-gray-400 hover:text-indigo-600 transition-colors p-1"
                                    title="Copy variable"
                                  >
                                    <Copy size={12} />
                                  </button>
                                </div>
                                <div className="text-xs text-gray-800 font-mono break-all whitespace-pre-wrap">
                                  {typeof value === 'object' && value !== null
                                    ? JSON.stringify(value, null, 2)
                                    : String(value)
                                  }
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="font-semibold text-gray-500 uppercase text-xs mb-2">
                Jobs ({nodes.length})
              </h3>
              {nodes.length === 0 ? (
                <p className="text-gray-400 text-sm">No jobs found matching "{searchQuery}"</p>
              ) : (
                [...nodes].sort((a, b) => a.id.localeCompare(b.id)).map(node => (
                  <div
                    key={node.id}
                    onClick={() => {
                      setSelectedJob(node.data.details);
                      // Optional: Center view on node?
                    }}
                    className="p-3 border border-gray-200 rounded-sm hover:bg-indigo-50 cursor-pointer transition-colors"
                  >
                    <div className="font-medium text-gray-800">{node.data.label}</div>
                    {node.data.details.parent && (
                      <div className="text-xs text-gray-500 mt-1">Parent: {node.data.details.parent}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chat Modal */}
      {isChatOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setIsChatOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-2xl w-full max-w-lg h-[600px] flex flex-col animate-in fade-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-indigo-600 text-white rounded-t-lg">
              <div className="font-bold flex items-center gap-2">
                <MessageSquare size={18} />
                Ask about {selectedJob ? selectedJob.name : "Jobs"}
              </div>
              <button onClick={() => setIsChatOpen(false)} className="hover:bg-indigo-700 p-1 rounded-sm">
                <X size={20} />
              </button>
            </div>

            {/* Chat History */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {chatHistory.length === 0 && (
                <div className="text-center mt-10 text-gray-400">
                  <MessageSquare size={48} className="mx-auto mb-2 opacity-50" />
                  <p>Ask a question about {selectedJob ? "this job" : "any job"}.</p>
                  {selectedJob && <p className="text-xs mt-2">Try: "What are the variables?"</p>}
                </div>
              )}
              {chatHistory.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-lg p-3 text-sm ${msg.type === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 shadow-xs'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer Input */}
            <form onSubmit={handleChatSubmit} className="p-4 border-t border-gray-200 bg-white flex gap-2 rounded-b-lg">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder={selectedJob ? "Ask a question..." : "Select a job to start chatting"}
                disabled={!selectedJob}
                className="flex-1 border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
              />
              <button
                type="submit"
                disabled={!selectedJob || !chatInput.trim()}
                className="bg-indigo-600 text-white p-2 rounded-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={18} />
              </button>
            </form>
          </div>
        </div>
      )
      }

      {/* Repo Load Modal */}
      {isRepoModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => !repoLoading && setIsRepoModalOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md animate-in fade-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="font-bold text-lg text-gray-800">Load Git Repository</h3>
              {!repoLoading && (
                <button onClick={() => setIsRepoModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              )}
            </div>
            <form onSubmit={handleLoadRepo} className="p-4">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Repository URL
                </label>
                <input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/organization/repo.git"
                  className="w-full px-3 py-2 border border-gray-300 rounded-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  disabled={repoLoading}
                />
              </div>

              {activeRepos.length > 0 && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Active Repositories
                  </label>
                  <div className="max-h-[100px] overflow-y-auto border border-gray-200 rounded-sm bg-indigo-50 p-2">
                    <ul className="space-y-1">
                      {activeRepos.map((repo, idx) => {
                        const url = typeof repo === 'object' ? repo.url : repo;
                        const name = url ? url.split('/').pop().replace('.git', '') : 'Unknown Local Path';
                        return (
                          <li key={idx} className="text-xs text-indigo-800 flex items-center gap-2 break-all" title={url}>
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></span>
                            {name}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}

              {repoHistory.length > 0 && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Recent Repositories
                  </label>
                  <div className="max-h-[150px] overflow-y-auto border border-gray-200 rounded-sm bg-gray-50">
                    {repoHistory.map((repo, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleLoadRepo(repo.url)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 border-b border-gray-100 last:border-0 flex flex-col"
                        disabled={repoLoading}
                      >
                        <span className="font-medium text-gray-800 truncate w-full">{repo.url}</span>
                        <span className="text-xs text-gray-500">{repo.date}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRepoModalOpen(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-sm"
                  disabled={repoLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={repoLoading || !repoUrl.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {repoLoading ? 'Loading...' : 'Load'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* Theme Modal */}
      {isThemeModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setIsThemeModalOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-lg">
              <div className="font-bold flex items-center gap-2 text-gray-800">
                <Palette size={18} />
                Customize Appearance
              </div>
              <button onClick={() => setIsThemeModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { id: 'job', label: 'Regular Job', desc: 'Standard job nodes' },
                  { id: 'final', label: 'Final Job', desc: 'Jobs with no children' },
                  { id: 'selected', label: 'Selected Job', desc: 'The job you clicked on' },
                  { id: 'parent', label: 'Parent Job', desc: 'Parent of selected job' },
                  { id: 'descendant', label: 'Descendant Job', desc: 'Child jobs of selected' },
                ].map((type) => (
                  <div key={type.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <h4 className="font-semibold text-gray-800 mb-1">{type.label}</h4>
                    <p className="text-xs text-gray-500 mb-3">{type.desc}</p>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Background</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={colorConfig[type.id].bg}
                            onChange={(e) => setColorConfig(prev => ({
                              ...prev,
                              [type.id]: { ...prev[type.id], bg: e.target.value }
                            }))}
                            className="w-8 h-8 rounded-sm cursor-pointer border-0 p-0"
                          />
                          <span className="text-xs font-mono text-gray-500 w-16">{colorConfig[type.id].bg}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Text Color</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={colorConfig[type.id].text}
                            onChange={(e) => setColorConfig(prev => ({
                              ...prev,
                              [type.id]: { ...prev[type.id], text: e.target.value }
                            }))}
                            className="w-8 h-8 rounded-sm cursor-pointer border-0 p-0"
                          />
                          <span className="text-xs font-mono text-gray-500 w-16">{colorConfig[type.id].text}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Border Color</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={colorConfig[type.id].border}
                            onChange={(e) => setColorConfig(prev => ({
                              ...prev,
                              [type.id]: { ...prev[type.id], border: e.target.value }
                            }))}
                            className="w-8 h-8 rounded-sm cursor-pointer border-0 p-0"
                          />
                          <span className="text-xs font-mono text-gray-500 w-16">{colorConfig[type.id].border}</span>
                        </div>
                      </div>

                      {/* Preview */}
                      <div className="mt-3 pt-3 border-t border-gray-200 flex justify-center">
                        <div
                          className="px-4 py-2 rounded-sm text-sm font-medium shadow-xs transition-all"
                          style={{
                            backgroundColor: colorConfig[type.id].bg,
                            color: colorConfig[type.id].text,
                            border: `2px solid ${colorConfig[type.id].border}`
                          }}
                        >
                          Preview Node
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg flex justify-between items-center">
              <button
                onClick={resetColors}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-sm transition-colors"
              >
                <RotateCcw size={14} /> Reset to Defaults
              </button>
              <button
                onClick={() => setIsThemeModalOpen(false)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
