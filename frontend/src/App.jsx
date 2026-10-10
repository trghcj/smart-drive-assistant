import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Folder,
  FolderPlus,
  FileText,
  FileSpreadsheet,
  FileImage,
  HardDrive,
  Users,
  Clock,
  Star,
  Trash2,
  Copy,
  Sparkles,
  HelpCircle,
  Settings,
  ChevronRight,
  ChevronDown,
  Plus,
  RefreshCw,
  List,
  LayoutGrid,
  MoreVertical,
  Search,
  X,
  Paperclip,
  Send,
  Mic,
  MicOff,
  CheckCircle,
  RotateCcw,
  ExternalLink,
  ShieldCheck,
  Zap,
  FolderSync,
  PanelLeftClose,
  PanelLeftOpen,
  Share2,
  Sun,
  Moon
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api';

// Helper to render assistant messages with clean styling without raw markdown asterisks, hashes, or slashes
function FormattedMessage({ text }) {
  if (!text) return null;

  // Split lines
  const lines = text.split('\n');

  // Helper to parse inline bolding (**text**) into <strong>
  const parseInline = (lineText) => {
    // Split by **
    const parts = lineText.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, idx) => {
      if (idx % 2 === 1) {
        // Bold part
        return <strong key={idx} className="font-semibold text-[#1e2419]">{part}</strong>;
      }
      return part;
    });
  };

  return (
    <div className="space-y-1.5 text-xs text-[#2c3327] leading-relaxed">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();

        // Empty line
        if (!line) {
          return <div key={idx} className="h-1.5" />;
        }

        // Markdown Heading (### Title or ## Title or # Title)
        if (line.startsWith('#')) {
          const headingText = line.replace(/^#+\s*/, '');
          return (
            <h4 key={idx} className="font-bold text-[#1e2419] text-[13px] pt-1.5 pb-0.5 tracking-tight border-b border-[#e5e8e1]/60">
              {parseInline(headingText)}
            </h4>
          );
        }

        // Bullet point (- or * or •)
        if (line.match(/^[-*•]\s+/)) {
          const bulletContent = line.replace(/^[-*•]\s+/, '');
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4d602c] mt-1.5 flex-shrink-0" />
              <div className="flex-1">{parseInline(bulletContent)}</div>
            </div>
          );
        }

        // Numbered list (1. 2. etc.)
        const numMatch = line.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
          const num = numMatch[1];
          const content = numMatch[2];
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 py-0.5">
              <span className="font-bold text-[#4d602c] text-[11px] w-4 flex-shrink-0 text-right">{num}.</span>
              <div className="flex-1">{parseInline(content)}</div>
            </div>
          );
        }

        // Table delimiter line (|---|---|) -> skip or clean
        if (line.startsWith('|') && line.includes('---')) {
          return null;
        }

        // Table row (| a | b | c |)
        if (line.startsWith('|') && line.endsWith('|')) {
          const cells = line.split('|').slice(1, -1).map(c => c.trim());
          return (
            <div key={idx} className="grid grid-flow-col auto-cols-fr gap-2 py-1 px-2 bg-white/70 rounded border border-[#e5e8e1]/50 text-[11px]">
              {cells.map((c, cIdx) => (
                <span key={cIdx} className="truncate">{parseInline(c)}</span>
              ))}
            </div>
          );
        }

        // Regular prose paragraph
        return (
          <p key={idx} className="py-0.5">
            {parseInline(line)}
          </p>
        );
      })}
    </div>
  );
}

export default function App() {
  const [sessionId, setSessionId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('session_id') || localStorage.getItem('drive_session_id') || null;
  });
  const [userProfile, setUserProfile] = useState(null);
  const [quota, setQuota] = useState(null);
  const [files, setFiles] = useState([]);
  const [currentFolder, setCurrentFolder] = useState('root');
  const [folderHistory, setFolderHistory] = useState([{ id: 'root', name: 'My Drive' }]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // Theme state: 'light' or 'dark' (explicitly manual toggle, no system theme listener)
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('drive_theme') || 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('drive_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Search & view mode
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'
  const [selectedNav, setSelectedNav] = useState('my-drive');
  const [selectedFileIds, setSelectedFileIds] = useState(new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Assistant & Chat state
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [assistantWidth, setAssistantWidth] = useState(380);
  const [isResizing, setIsResizing] = useState(false);
  const [activeTab, setActiveTab] = useState('suggestions'); // 'suggestions' or 'activity'
  const [prompt, setPrompt] = useState('');
  const [chatLog, setChatLog] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [proposedPlan, setProposedPlan] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [undoToken, setUndoToken] = useState(null);
  const [undoMessage, setUndoMessage] = useState(null);
  const [isListening, setIsListening] = useState(false);

  // Modals & menus
  const [organizeMenu, setOrganizeMenu] = useState(false);
  const [profileMenu, setProfileMenu] = useState(false);
  const [duplicatesModal, setDuplicatesModal] = useState(false);
  const [duplicateList, setDuplicateList] = useState([]);
  const [scanningDuplicates, setScanningDuplicates] = useState(false);
  const [scheduleModal, setScheduleModal] = useState(false);
  const [scheduleCron, setScheduleCron] = useState('every_friday');
  const [scheduleFolder, setScheduleFolder] = useState('Weekly Archive');
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [deleteAccountModal, setDeleteAccountModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [newFolderModal, setNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [shareModal, setShareModal] = useState(false);
  const [sharingFile, setSharingFile] = useState(null);
  const [shareEmail, setShareEmail] = useState('');
  const [shareRole, setShareRole] = useState('reader');
  const [sharingLoading, setSharingLoading] = useState(false);

  const chatEndRef = useRef(null);
  const promptInputRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chatLog, analyzing, proposedPlan]);

  // Drag-to-resize listener for My Drive & Assistant split
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 280 && newWidth <= Math.min(800, window.innerWidth - 320)) {
        setAssistantWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // Read session_id from URL query params on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('session_id') || localStorage.getItem('drive_session_id');
    if (sid) {
      setSessionId(sid);
      localStorage.setItem('drive_session_id', sid);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Fetch user info & files when session is present
  useEffect(() => {
    if (sessionId) {
      fetchUserProfile();
      fetchFiles(currentFolder, selectedNav);
    }
  }, [sessionId, currentFolder, selectedNav]);

  const handleGoogleLogin = async () => {
    try {
      const res = await axios.get(`${API_BASE}/auth/google/login`);
      if (res.data?.url) {
        window.location.href = res.data.url;
      }
    } catch (err) {
      console.error('Login error:', err);
      alert('Failed to initiate Google login. Is the FastAPI backend running?');
    }
  };

  const handleLogout = () => {
    setSessionId(null);
    setUserProfile(null);
    localStorage.removeItem('drive_session_id');
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await axios.post(`${API_BASE}/auth/delete-account?session_id=${sessionId}`);
    } catch (err) {
      console.error('Delete account error:', err);
    } finally {
      setDeletingAccount(false);
      setDeleteAccountModal(false);
      handleLogout();
    }
  };

  const fetchUserProfile = async () => {
    try {
      const res = await axios.get(`${API_BASE}/auth/me?session_id=${sessionId}`);
      setUserProfile(res.data.user);
      setQuota(res.data.quota);
    } catch (err) {
      console.error('Fetch user error:', err);
      if (err.response?.status === 401) {
        handleLogout();
      }
    }
  };

  const fetchFiles = async (folderId = currentFolder, navView = selectedNav) => {
    setLoadingFiles(true);
    try {
      const res = await axios.get(`${API_BASE}/drive/files?folder_id=${folderId}&view=${navView}&session_id=${sessionId}`);
      setFiles(res.data.files || []);
      setSelectedFileIds(new Set());
    } catch (err) {
      console.error('Error fetching files:', err);
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleSelectNav = (navId) => {
    setSelectedNav(navId);
    if (navId === 'my-drive') {
      setCurrentFolder('root');
      setFolderHistory([{ id: 'root', name: 'My Drive' }]);
      fetchFiles('root', 'my-drive');
    } else if (navId === 'shared') {
      setCurrentFolder('shared');
      setFolderHistory([{ id: 'shared', name: 'Shared with me' }]);
      fetchFiles('root', 'shared');
    } else if (navId === 'recent') {
      setCurrentFolder('recent');
      setFolderHistory([{ id: 'recent', name: 'Recent' }]);
      fetchFiles('root', 'recent');
    } else if (navId === 'starred') {
      setCurrentFolder('starred');
      setFolderHistory([{ id: 'starred', name: 'Starred' }]);
      fetchFiles('root', 'starred');
    } else if (navId === 'trash') {
      setCurrentFolder('trash');
      setFolderHistory([{ id: 'trash', name: 'Trash' }]);
      fetchFiles('root', 'trash');
    }
  };

  const navigateToFolder = (folder) => {
    setCurrentFolder(folder.id);
    setSelectedNav('my-drive');
    setFolderHistory((prev) => [...prev, folder]);
    fetchFiles(folder.id, 'my-drive');
  };

  const navigateBreadcrumb = (index) => {
    const target = folderHistory[index];
    setFolderHistory((prev) => prev.slice(0, index + 1));
    if (['shared', 'recent', 'starred', 'trash'].includes(target.id)) {
      handleSelectNav(target.id);
    } else {
      setSelectedNav('my-drive');
      setCurrentFolder(target.id);
      fetchFiles(target.id, 'my-drive');
    }
  };

  const handleToggleStar = async (file, e) => {
    e?.stopPropagation();
    try {
      const newStarred = !file.starred;
      await axios.post(`${API_BASE}/drive/star?file_id=${file.id}&starred=${newStarred}&session_id=${sessionId}`);
      setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, starred: newStarred } : f)));
    } catch (err) {
      console.error('Error toggling star:', err);
    }
  };

  const handleOpenShareModal = (file, e) => {
    e?.stopPropagation();
    setSharingFile(file);
    setShareEmail('');
    setShareRole('reader');
    setShareModal(true);
  };

  const handleShareItem = async (e) => {
    e?.preventDefault();
    if (!sharingFile || !shareEmail.trim() || sharingLoading) return;
    setSharingLoading(true);
    try {
      await axios.post(
        `${API_BASE}/drive/share?file_id=${sharingFile.id}&email=${encodeURIComponent(shareEmail.trim())}&role=${shareRole}&session_id=${sessionId}`
      );
      alert(`Successfully shared "${sharingFile.name}" with ${shareEmail} as ${shareRole}.`);
      setShareModal(false);
      setSharingFile(null);
      setShareEmail('');
    } catch (err) {
      alert(`Failed to share: ${err.response?.data?.detail || err.message}`);
    } finally {
      setSharingLoading(false);
    }
  };

  const handleToggleTrash = async (file, e) => {
    e?.stopPropagation();
    const isTrashed = file.trashed;
    const msg = isTrashed ? `Restore "${file.name}" to Drive?` : `Move "${file.name}" to Trash?`;
    if (!window.confirm(msg)) return;
    try {
      await axios.post(`${API_BASE}/drive/trash?file_id=${file.id}&trashed=${!isTrashed}&session_id=${sessionId}`);
      fetchFiles(currentFolder, selectedNav);
    } catch (err) {
      console.error('Error updating trash state:', err);
    }
  };

  const handleDeletePermanently = async (file, e) => {
    e?.stopPropagation();
    const msg = `⚠️ PERMANENT DELETION\n\nAre you sure you want to permanently delete "${file.name}"?\nThis action CANNOT be undone and will permanently remove the item from Google Drive.`;
    if (!window.confirm(msg)) return;
    try {
      await axios.delete(`${API_BASE}/drive/delete-permanent?file_id=${file.id}&session_id=${sessionId}`);
      fetchFiles(currentFolder, selectedNav);
    } catch (err) {
      console.error('Error permanently deleting file:', err);
      alert(`Failed to delete permanently: ${err.response?.data?.detail || err.message}`);
    }
  };

  const handleCreateFolder = async (e) => {
    e?.preventDefault();
    if (!newFolderName.trim() || creatingFolder) return;
    setCreatingFolder(true);
    try {
      await axios.post(
        `${API_BASE}/drive/create-folder?folder_name=${encodeURIComponent(newFolderName.trim())}&parent_id=${currentFolder}&session_id=${sessionId}`
      );
      setNewFolderName('');
      setNewFolderModal(false);
      fetchFiles(currentFolder, selectedNav);
    } catch (err) {
      alert(`Error creating folder: ${err.message}`);
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleFileUpload = async (filesToUpload) => {
    if (!filesToUpload || filesToUpload.length === 0) return;
    setUploading(true);
    let successCount = 0;

    for (const file of filesToUpload) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        await axios.post(`${API_BASE}/drive/upload?folder_id=${currentFolder}&session_id=${sessionId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        successCount++;
      } catch (err) {
        console.error('Upload error:', err);
      }
    }

    setUploading(false);
    fetchFiles(currentFolder);
    setChatLog((prev) => [
      ...prev,
      { role: 'assistant', text: `Uploaded ${successCount} file(s) into this folder.` }
    ]);
    setActiveTab('activity');
  };

  const handleScanDuplicates = async () => {
    setScanningDuplicates(true);
    setDuplicatesModal(true);
    try {
      const res = await axios.get(`${API_BASE}/drive/duplicates?folder_id=${currentFolder}&session_id=${sessionId}`);
      setDuplicateList(res.data.duplicates || []);
    } catch (err) {
      console.error('Scan error:', err);
    } finally {
      setScanningDuplicates(false);
    }
  };

  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_BASE}/drive/schedule-cleanup?session_id=${sessionId}`, {
        cron_time: scheduleCron,
        target_folder_name: scheduleFolder
      });
      setScheduleModal(false);
      setChatLog((prev) => [
        ...prev,
        { role: 'assistant', text: res.data.message }
      ]);
      setActiveTab('activity');
    } catch (err) {
      alert(`Schedule error: ${err.message}`);
    }
  };

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!prompt.trim() || analyzing) return;

    const userMessage = prompt;
    setPrompt('');
    setChatLog((prev) => [...prev, { role: 'user', text: userMessage }]);
    setAnalyzing(true);
    setProposedPlan(null);
    setReviewing(false);
    setActiveTab('activity');

    try {
      const res = await axios.post(`${API_BASE}/agent/chat?session_id=${sessionId}`, {
        message: userMessage,
        current_folder_id: currentFolder
      });

      setChatLog((prev) => [
        ...prev,
        { role: 'assistant', text: res.data.explanation }
      ]);

      if (res.data.operations && res.data.operations.length > 0) {
        setProposedPlan(res.data);
      }
    } catch (err) {
      setChatLog((prev) => [
        ...prev,
        { role: 'assistant', text: `Notice: ${err.response?.data?.detail || err.message}` }
      ]);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleExecutePlan = async () => {
    if (!proposedPlan) return;
    setExecuting(true);
    try {
      const res = await axios.post(`${API_BASE}/agent/execute?session_id=${sessionId}`, {
        operations: proposedPlan.operations
      });
      if (res.data.undo_token) {
        setUndoToken(res.data.undo_token);
      }
      setUndoMessage(res.data.message);
      setProposedPlan(null);
      setReviewing(false);
      fetchFiles(currentFolder);
    } catch (err) {
      alert(`Execution error: ${err.response?.data?.detail || err.message}`);
    } finally {
      setExecuting(false);
    }
  };

  const handleUndo = async () => {
    if (!undoToken) return;
    try {
      const res = await axios.post(`${API_BASE}/agent/undo?undo_token=${undoToken}&session_id=${sessionId}`);
      setUndoToken(null);
      setUndoMessage(null);
      fetchFiles(currentFolder);
    } catch (err) {
      alert(`Undo failed: ${err.message}`);
    }
  };

  const toggleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setPrompt(transcript);
        setIsListening(false);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognition.start();
    } catch (err) {
      console.error('Speech recognition error:', err);
      setIsListening(false);
    }
  };

  const openAssistantWith = (text) => {
    setAssistantOpen(true);
    if (text) {
      setPrompt(text);
      setTimeout(() => promptInputRef.current?.focus(), 50);
    }
  };

  const toggleSelectAll = () => {
    if (selectedFileIds.size === visibleFiles.length) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(visibleFiles.map((f) => f.id)));
    }
  };

  const toggleSelectFile = (id) => {
    const next = new Set(selectedFileIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedFileIds(next);
  };

  const clearSelection = () => {
    setSelectedFileIds(new Set());
  };

  const getSelectedFileList = () => {
    return visibleFiles.filter((f) => selectedFileIds.has(f.id));
  };

  const handleBulkTrash = async () => {
    const count = selectedFileIds.size;
    if (count === 0) return;
    if (!window.confirm(`Move ${count} selected item(s) to Trash?`)) return;

    const list = getSelectedFileList();
    try {
      await Promise.all(
        list.map((file) =>
          axios.post(`${API_BASE}/drive/trash?file_id=${file.id}&trashed=true&session_id=${sessionId}`)
        )
      );
      clearSelection();
      fetchFiles(currentFolder, selectedNav);
    } catch (err) {
      console.error('Error trashing selected files:', err);
      alert(`Failed to trash some items: ${err.message}`);
    }
  };

  const handleBulkDeletePermanently = async () => {
    const count = selectedFileIds.size;
    if (count === 0) return;
    const msg = `⚠️ PERMANENT DELETION\n\nAre you sure you want to permanently delete all ${count} selected item(s)?\nThis action CANNOT be undone and will permanently remove them from Google Drive.`;
    if (!window.confirm(msg)) return;

    const list = getSelectedFileList();
    try {
      await Promise.all(
        list.map((file) =>
          axios.delete(`${API_BASE}/drive/delete-permanent?file_id=${file.id}&session_id=${sessionId}`)
        )
      );
      clearSelection();
      fetchFiles(currentFolder, selectedNav);
    } catch (err) {
      console.error('Error permanently deleting selected files:', err);
      alert(`Failed to delete some items: ${err.message}`);
    }
  };

  const handleBulkStar = async () => {
    const count = selectedFileIds.size;
    if (count === 0) return;

    const list = getSelectedFileList();
    // If all are starred, unstar them; otherwise star them
    const allStarred = list.every((f) => f.starred);
    const newStarred = !allStarred;

    try {
      await Promise.all(
        list.map((file) =>
          axios.post(`${API_BASE}/drive/star?file_id=${file.id}&starred=${newStarred}&session_id=${sessionId}`)
        )
      );
      clearSelection();
      fetchFiles(currentFolder, selectedNav);
    } catch (err) {
      console.error('Error toggling stars on selected files:', err);
      alert(`Failed to update star status: ${err.message}`);
    }
  };

  const handleBulkAskAssistant = (action = 'organize') => {
    const list = getSelectedFileList();
    if (list.length === 0) return;
    const names = list.map((f) => `"${f.name}"`).join(', ');

    let query = '';
    if (action === 'organize') {
      query = `Please organize these ${list.length} selected files: ${names}`;
    } else if (action === 'summarize') {
      query = `Please summarize the purpose and details of these ${list.length} selected files: ${names}`;
    } else if (action === 'archive') {
      query = `Create an Archive folder and move these selected files into it: ${names}`;
    } else {
      query = `Here are the selected files: ${names}. What can I do with them?`;
    }

    openAssistantWith(query);
  };

  const formatSize = (bytes) => {
    if (!bytes) return '—';
    const n = Number(bytes);
    if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(n / 1024))} KB`;
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatStorage = (bytes) => {
    if (!bytes) return '0 B';
    const n = Number(bytes);
    if (isNaN(n)) return '0 B';
    if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
    return `${Math.round(n / 1024 / 1024)} MB`;
  };

  const usedBytes = Number(quota?.usage || 0);
  const limitBytes = Number(quota?.limit || 16106127360);
  const usedPercent = limitBytes > 0 ? Math.min(100, Math.round((usedBytes / limitBytes) * 100)) : 0;

  const getFileIcon = (item) => {
    if (item.isFolder) {
      return (
        <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
        </svg>
      );
    }
    if (item.mimeType.includes('pdf')) {
      return (
        <span className="w-5 h-5 rounded bg-rose-500 text-white font-bold text-[9px] flex items-center justify-center flex-shrink-0 tracking-tighter">
          PDF
        </span>
      );
    }
    if (item.mimeType.includes('spreadsheet') || item.mimeType.includes('sheet')) {
      return (
        <span className="w-5 h-5 rounded bg-emerald-600 text-white font-bold text-[9px] flex items-center justify-center flex-shrink-0">
          XLS
        </span>
      );
    }
    if (item.mimeType.includes('image')) {
      return <FileImage className="w-5 h-5 text-sky-500 flex-shrink-0" />;
    }
    return (
      <span className="w-5 h-5 rounded bg-blue-500 text-white font-bold text-[9px] flex items-center justify-center flex-shrink-0">
        DOC
      </span>
    );
  };

  const suggestions = [
    { text: 'Find all invoice PDFs', icon: 'file' },
    { text: 'Group placement documents', icon: 'folder' },
    { text: 'Find duplicate files', icon: 'copy' },
    { text: 'Create a folder for images', icon: 'image' },
  ];

  const visibleFiles = files.filter((f) =>
    f.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#f7f8f6] text-[#2c3327] font-sans flex flex-col antialiased">
      {/* ================= TOP NAVBAR ================= */}
      <header className="h-16 bg-white border-b border-[#e5e8e1] flex items-center justify-between flex-shrink-0 z-30">
        {/* Brand & Sidebar Toggle (matches sidebar width exactly) */}
        <div
          className={`h-full flex items-center border-r border-[#e5e8e1] transition-all duration-200 flex-shrink-0 ${
            sidebarCollapsed ? 'w-16 justify-center' : 'w-60 px-4 justify-between'
          }`}
        >
          {!sidebarCollapsed ? (
            <>
              <button
                onClick={() => handleSelectNav('my-drive')}
                className="flex items-center gap-2.5 hover:opacity-90 transition cursor-pointer text-left flex-shrink-0"
                title="Go to My Drive"
              >
                <div className="w-9 h-9 rounded-xl bg-[#4d602c] text-white flex items-center justify-center shadow-sm flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </div>
                <span className="font-semibold text-base tracking-tight text-[#1e2419] whitespace-nowrap">
                  Smart Drive
                </span>
              </button>
              {sessionId && (
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="p-1.5 rounded-lg text-[#6b7362] hover:bg-[#f2f4ef] hover:text-[#1e2419] transition cursor-pointer flex-shrink-0"
                  title="Collapse sidebar"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              )}
            </>
          ) : (
            sessionId && (
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="p-2 rounded-xl text-[#6b7362] hover:bg-[#f2f4ef] hover:text-[#1e2419] transition cursor-pointer"
                title="Expand sidebar"
              >
                <PanelLeftOpen className="w-5 h-5" />
              </button>
            )
          )}
        </div>

        {/* Search Bar & User Actions */}
        <div className="flex-1 flex items-center justify-between gap-4 px-6 min-w-0">

        {/* Search Bar */}
        {sessionId && (
          <div className="flex-1 max-w-xl">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-[#8a9282] absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search files and folders..."
                className="w-full bg-[#f2f4ef] hover:bg-[#ebeee7] focus:bg-white text-sm text-[#1e2419] placeholder-[#8a9282] rounded-xl pl-10 pr-4 py-2 border border-transparent focus:border-[#4d602c] focus:outline-none transition"
              />
            </div>
          </div>
        )}

        {/* Right Nav Actions */}
        <div className="flex items-center gap-3">
          {/* Light / Dark Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#f2f4ef] hover:bg-[#e4ebdb] text-[#3d4d23] border border-[#e5e8e1] transition cursor-pointer shadow-xs"
            title={theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400 hover:rotate-45 transition-transform" />
            ) : (
              <Moon className="w-4 h-4 text-[#4d602c] hover:-rotate-12 transition-transform" />
            )}
          </button>

          {/* User Profile Pill */}
          {sessionId && userProfile && (
            <div className="relative">
              <button
                onClick={() => setProfileMenu((v) => !v)}
                className="flex items-center gap-2.5 pl-1.5 pr-2 py-1 rounded-full bg-white border border-[#e5e8e1] hover:border-[#4d602c] transition cursor-pointer"
              >
                {userProfile.photoLink ? (
                  <img src={userProfile.photoLink} alt={userProfile.displayName} className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-[#4d602c] text-white flex items-center justify-center text-xs font-semibold">
                    {userProfile.displayName?.charAt(0) || 'D'}
                  </div>
                )}
                <span className="text-xs font-medium text-[#1e2419] max-w-[120px] truncate">
                  {userProfile.displayName || 'User'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-[#8a9282]" />
              </button>

              {profileMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setProfileMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-[#e5e8e1] rounded-2xl shadow-xl py-2 z-50 text-xs text-[#2c3327]">
                    <div className="px-4 py-2 border-b border-[#f2f4ef]">
                      <p className="font-semibold text-sm truncate">{userProfile.displayName}</p>
                      <p className="text-[#8a9282] truncate">{userProfile.emailAddress}</p>
                    </div>
                    <button
                      onClick={() => { setProfileMenu(false); handleLogout(); }}
                      className="w-full text-left px-4 py-2 hover:bg-[#f7f8f6] transition text-[#2c3327]"
                    >
                      Sign Out
                    </button>
                    <button
                      onClick={() => { setProfileMenu(false); setDeleteAccountModal(true); }}
                      className="w-full text-left px-4 py-2 hover:bg-rose-50 text-rose-600 transition"
                    >
                      Delete Account & Data
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      </header>

      {/* ================= MAIN CONTENT ================= */}
      {!sessionId ? (
        /* CONNECT GOOGLE DRIVE LANDING SCREEN */
        <main className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center p-8">
          <div className="max-w-4xl w-full bg-white rounded-3xl border border-[#e5e8e1] shadow-xl p-10 lg:p-14 flex flex-col md:flex-row items-center gap-10">
            {/* Illustration */}
            <div className="flex-1 flex items-center justify-center relative">
              <div className="w-64 h-64 rounded-full bg-[#f2f5ed] flex items-center justify-center relative">
                <div className="w-36 h-28 bg-[#d8dfcb] rounded-2xl shadow-md flex items-center justify-center transform -rotate-3">
                  <div className="w-16 h-10 bg-[#c5cfb3] rounded-t-xl absolute -top-3 left-4" />
                </div>
                <div className="w-14 h-14 bg-white rounded-2xl shadow-lg border border-[#e5e8e1] flex items-center justify-center absolute -bottom-2 -right-2">
                  <img src="https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png" alt="Drive" className="w-8 h-8" />
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 space-y-6">
              <div>
                <h2 className="text-3xl font-bold text-[#1e2419] tracking-tight">Connect Google Drive</h2>
                <p className="text-sm text-[#6b7362] mt-2 leading-relaxed">
                  Smart Drive needs access to your Google Drive to organize files, find duplicates, and perform requested actions.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="flex items-start gap-2.5 text-xs text-[#6b7362]">
                  <ShieldCheck className="w-4 h-4 text-[#4d602c] flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-[#1e2419] block">Secure access</strong>
                    We only access the files you choose to work with.
                  </div>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-[#6b7362]">
                  <FolderSync className="w-4 h-4 text-[#4d602c] flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-[#1e2419] block">Organize effortlessly</strong>
                    Find duplicates, clean up files, and organize folders.
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button
                  onClick={handleGoogleLogin}
                  className="w-full sm:w-auto px-8 py-3.5 bg-[#4d602c] hover:bg-[#3f4f24] text-white font-medium text-sm rounded-xl shadow-lg shadow-[#4d602c]/20 transition flex items-center justify-center gap-3 cursor-pointer"
                >
                  <img src="https://www.gstatic.com/images/branding/product/1x/googleg_32dp.png" alt="Google" className="w-5 h-5 bg-white p-0.5 rounded-full" />
                  <span>Connect Google Drive</span>
                </button>
                <p className="text-[11px] text-[#8a9282] mt-3">You can disconnect your account at any time from settings.</p>
              </div>
            </div>
          </div>
        </main>
      ) : (
        /* 3-COLUMN DASHBOARD (SIDEBAR + FILE MANAGER + ASSISTANT) */
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* ================= LEFT SIDEBAR ================= */}
          <aside
            className={`bg-white border-r border-[#e5e8e1] flex flex-col justify-between flex-shrink-0 h-full overflow-y-auto transition-all duration-200 ${
              sidebarCollapsed ? 'w-16 p-2 items-center' : 'w-60 p-4'
            }`}
          >
            <div className="space-y-6 w-full">
              {/* Primary Nav */}
              <nav className="space-y-1 w-full">
                {[
                  { id: 'my-drive', label: 'My Drive', icon: HardDrive },
                  { id: 'shared', label: 'Shared with me', icon: Users },
                  { id: 'recent', label: 'Recent', icon: Clock },
                  { id: 'starred', label: 'Starred', icon: Star },
                  { id: 'trash', label: 'Trash', icon: Trash2 },
                ].map((item) => {
                  const Icon = item.icon;
                  const active = selectedNav === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectNav(item.id)}
                      title={item.label}
                      className={`w-full flex items-center rounded-xl text-xs font-medium transition cursor-pointer ${
                        sidebarCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3.5 py-2.5'
                      } ${
                        active
                          ? 'bg-[#edf2e4] text-[#3d4d23] font-semibold'
                          : 'text-[#5a6252] hover:bg-[#f7f8f6] hover:text-[#1e2419]'
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {!sidebarCollapsed && <span>{item.label}</span>}
                    </button>
                  );
                })}
              </nav>

              {/* Tools Section */}
              <div className="w-full">
                {!sidebarCollapsed ? (
                  <p className="text-[10px] uppercase font-bold tracking-wider text-[#8a9282] px-3.5 mb-2">Tools</p>
                ) : (
                  <div className="h-px bg-[#f0f2eb] my-2 w-full" />
                )}
                <div className="space-y-1 w-full">
                  <button
                    onClick={handleScanDuplicates}
                    title="Find duplicates"
                    className={`w-full flex items-center rounded-xl text-xs font-medium text-[#5a6252] hover:bg-[#f7f8f6] hover:text-[#1e2419] transition cursor-pointer ${
                      sidebarCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3.5 py-2.5'
                    }`}
                  >
                    <Copy className="w-4 h-4 text-[#7b8371] flex-shrink-0" />
                    {!sidebarCollapsed && <span>Find duplicates</span>}
                  </button>
                  <button
                    onClick={() => setScheduleModal(true)}
                    title="Clean up"
                    className={`w-full flex items-center rounded-xl text-xs font-medium text-[#5a6252] hover:bg-[#f7f8f6] hover:text-[#1e2419] transition cursor-pointer ${
                      sidebarCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3.5 py-2.5'
                    }`}
                  >
                    <Zap className="w-4 h-4 text-[#7b8371] flex-shrink-0" />
                    {!sidebarCollapsed && <span>Clean up</span>}
                  </button>
                  <button
                    onClick={() => {
                      setAssistantOpen(true);
                      setTimeout(() => promptInputRef.current?.focus(), 100);
                    }}
                    title="Assistant"
                    className={`w-full flex items-center rounded-xl text-xs font-medium text-[#5a6252] hover:bg-[#f7f8f6] hover:text-[#1e2419] transition cursor-pointer ${
                      sidebarCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3.5 py-2.5'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-[#4d602c] flex-shrink-0" />
                    {!sidebarCollapsed && <span>Assistant</span>}
                  </button>
                </div>
              </div>
            </div>

            {/* Storage Progress */}
            <div className="w-full">
              {sidebarCollapsed ? (
                <div
                  className="p-2 bg-[#f7f8f6] rounded-xl border border-[#e5e8e1] flex flex-col items-center justify-center text-[10px] text-[#3d4d23]"
                  title={`Storage: ${formatStorage(quota?.usage)} of ${formatStorage(quota?.limit)} used`}
                >
                  <HardDrive className="w-4 h-4 mb-1 text-[#4d602c]" />
                  <span className="font-semibold">{usedPercent}%</span>
                </div>
              ) : (
                <div className="p-3 bg-[#f7f8f6] rounded-2xl border border-[#e5e8e1]">
                  <div className="flex items-center justify-between text-xs font-medium text-[#3d4d23]">
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4" />
                      <span>Storage</span>
                    </div>
                    <span className="text-[10px] text-[#8a9282] font-semibold">{usedPercent}%</span>
                  </div>
                  <div className="w-full bg-[#e5e8e1] rounded-full h-1.5 mt-2 overflow-hidden">
                    <div
                      className="bg-[#4d602c] h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${usedPercent}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-[#8a9282] mt-1.5">
                    {formatStorage(quota?.usage)} of {formatStorage(quota?.limit)} used
                  </p>
                </div>
              )}
            </div>
          </aside>

          {/* ================= MIDDLE: FILE MANAGER ================= */}
          <main className="flex-1 min-w-0 flex flex-col bg-white h-full overflow-hidden">
            {/* Top Bar (Breadcrumbs + Actions) */}
            <div className="px-6 py-4 border-b border-[#e5e8e1] flex items-center justify-between gap-4 flex-shrink-0">
              {/* Breadcrumb Path */}
              <nav className="flex items-center text-sm font-medium text-[#6b7362] truncate">
                {folderHistory.map((folder, idx) => (
                  <React.Fragment key={folder.id}>
                    {idx > 0 && <ChevronRight className="w-4 h-4 mx-1.5 text-[#8a9282] flex-shrink-0" />}
                    <button
                      onClick={() => navigateBreadcrumb(idx)}
                      className={`hover:text-[#1e2419] transition cursor-pointer ${
                        idx === folderHistory.length - 1 ? 'font-bold text-[#1e2419]' : ''
                      }`}
                    >
                      {folder.name}
                    </button>
                  </React.Fragment>
                ))}
              </nav>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {/* Upload Button */}
                <label className="flex items-center gap-1.5 px-3.5 py-2 bg-[#4d602c] hover:bg-[#3f4f24] text-white text-xs font-medium rounded-xl transition cursor-pointer shadow-sm">
                  <Plus className="w-3.5 h-3.5" />
                  <span>{uploading ? 'Uploading...' : 'Upload'}</span>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      handleFileUpload(Array.from(e.target.files));
                      e.target.value = '';
                    }}
                  />
                </label>

                {/* New Folder Button */}
                <button
                  onClick={() => setNewFolderModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[#e5e8e1] hover:bg-[#f7f8f6] text-[#2c3327] text-xs font-medium rounded-xl transition cursor-pointer"
                  title="Create new folder"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-[#6b7362]" />
                  <span>Folder</span>
                </button>

                {/* Organize Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setOrganizeMenu((v) => !v)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[#e5e8e1] hover:bg-[#f7f8f6] text-[#2c3327] text-xs font-medium rounded-xl transition cursor-pointer"
                  >
                    <span>Organize</span>
                    <ChevronDown className="w-3.5 h-3.5 text-[#8a9282]" />
                  </button>

                  {organizeMenu && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setOrganizeMenu(false)} />
                      <div className="absolute right-0 top-full mt-1.5 w-60 bg-white border border-[#e5e8e1] rounded-2xl shadow-xl py-2 z-40 text-xs text-[#2c3327]">
                        <button
                          onClick={() => { setOrganizeMenu(false); handleScanDuplicates(); }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-[#f7f8f6] transition cursor-pointer"
                        >
                          <Copy className="w-4 h-4 text-[#8a9282]" />
                          <span>Find duplicates</span>
                        </button>
                        <button
                          onClick={() => { setOrganizeMenu(false); setScheduleModal(true); }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-[#f7f8f6] transition cursor-pointer"
                        >
                          <Zap className="w-4 h-4 text-[#8a9282]" />
                          <span>Schedule clean up</span>
                        </button>
                        <button
                          onClick={() => {
                            setOrganizeMenu(false);
                            openAssistantWith("Organize all files in this folder into categorized folders by file type (Documents, Images, Spreadsheets, etc.)");
                          }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-[#f7f8f6] transition cursor-pointer"
                        >
                          <FolderSync className="w-4 h-4 text-[#4d602c]" />
                          <span>Organize by type</span>
                        </button>
                        <button
                          onClick={() => {
                            setOrganizeMenu(false);
                            openAssistantWith("Organize all files in this folder by year and month into archive folders");
                          }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-[#f7f8f6] transition cursor-pointer"
                        >
                          <Clock className="w-4 h-4 text-[#4d602c]" />
                          <span>Organize by date</span>
                        </button>
                        <button
                          onClick={() => { setOrganizeMenu(false); openAssistantWith(); }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-[#f7f8f6] transition cursor-pointer border-t border-[#f2f4ef] mt-1 pt-2"
                        >
                          <Sparkles className="w-4 h-4 text-[#4d602c]" />
                          <span>Ask Assistant to sort</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Refresh */}
                <button
                  onClick={() => fetchFiles(currentFolder, selectedNav)}
                  className="p-2 text-[#6b7362] hover:bg-[#f7f8f6] rounded-xl border border-[#e5e8e1] transition cursor-pointer"
                  title="Refresh folder"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`} />
                </button>

                {/* View Switchers */}
                <div className="flex items-center border border-[#e5e8e1] rounded-xl p-0.5 bg-white">
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded-lg transition ${viewMode === 'list' ? 'bg-[#edf2e4] text-[#3d4d23]' : 'text-[#8a9282] hover:text-[#1e2419]'}`}
                    title="List view"
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded-lg transition ${viewMode === 'grid' ? 'bg-[#edf2e4] text-[#3d4d23]' : 'text-[#8a9282] hover:text-[#1e2419]'}`}
                    title="Grid view"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Active Selection Bulk Action Bar */}
            {selectedFileIds.size > 0 && (
              <div className="mx-6 mt-3 px-4 py-2 bg-[#edf2e4] border border-[#c8d6b9] rounded-2xl flex items-center justify-between gap-4 text-xs shadow-sm animate-in fade-in flex-shrink-0">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-[#2f3d1b] flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-[#4d602c] text-white text-[11px] font-bold flex items-center justify-center">
                      {selectedFileIds.size}
                    </span>
                    <span>item{selectedFileIds.size > 1 ? 's' : ''} selected</span>
                  </span>

                  <button
                    onClick={clearSelection}
                    className="text-[#6b7362] hover:text-[#1e2419] underline font-medium cursor-pointer ml-1"
                  >
                    Clear selection
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {/* Ask Assistant for Selected Files */}
                  <button
                    onClick={() => handleBulkAskAssistant('organize')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4d602c] hover:bg-[#3f4f24] text-white rounded-xl font-medium transition cursor-pointer shadow-xs"
                    title="Ask AI Assistant to organize or process these files"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Ask Assistant</span>
                  </button>

                  {/* Bulk Star / Unstar */}
                  <button
                    onClick={handleBulkStar}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#c8d6b9] hover:bg-[#f7f8f6] text-[#2c3327] rounded-xl font-medium transition cursor-pointer"
                    title="Star / Unstar selected items"
                  >
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    <span>Star / Unstar</span>
                  </button>

                  {/* Share button */}
                  {selectedFileIds.size === 1 && (
                    <button
                      onClick={() => {
                        const file = getSelectedFileList()[0];
                        if (file) handleOpenShareModal(file);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#c8d6b9] hover:bg-[#f7f8f6] text-[#2c3327] rounded-xl font-medium transition cursor-pointer"
                      title="Share selected item"
                    >
                      <Share2 className="w-3.5 h-3.5 text-[#4d602c]" />
                      <span>Share</span>
                    </button>
                  )}

                  {/* Trash & Permanent Delete buttons */}
                  {selectedNav === 'trash' ? (
                    <>
                      <button
                        onClick={async () => {
                          const count = selectedFileIds.size;
                          if (count === 0) return;
                          if (!window.confirm(`Restore ${count} selected item(s) to Drive?`)) return;
                          const list = getSelectedFileList();
                          try {
                            await Promise.all(
                              list.map((file) =>
                                axios.post(`${API_BASE}/drive/trash?file_id=${file.id}&trashed=false&session_id=${sessionId}`)
                              )
                            );
                            clearSelection();
                            fetchFiles(currentFolder, selectedNav);
                          } catch (err) {
                            alert(`Failed to restore items: ${err.message}`);
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#c8d6b9] hover:bg-[#f7f8f6] text-[#3d4d23] rounded-xl font-medium transition cursor-pointer"
                        title="Restore selected items"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restore</span>
                      </button>
                      <button
                        onClick={handleBulkDeletePermanently}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-medium transition cursor-pointer shadow-xs"
                        title="Delete selected items permanently from Google Drive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Permanently</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleBulkTrash}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-xl font-medium transition cursor-pointer"
                        title="Move selected items to Trash"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Move to Trash</span>
                      </button>
                      <button
                        onClick={handleBulkDeletePermanently}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-medium transition cursor-pointer"
                        title="Permanently delete from Google Drive"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span>Delete Permanently</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Undo Notification Banner */}
            {undoMessage && (
              <div className="mx-6 mt-3 px-4 py-2.5 bg-[#f2f6ea] border border-[#d2dec0] rounded-xl flex items-center justify-between text-xs text-[#3d4d23] flex-shrink-0 animate-in fade-in">
                <span className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-[#4d602c]" />
                  <span>{undoMessage}</span>
                </span>
                <div className="flex items-center gap-2">
                  {undoToken && (
                    <button
                      onClick={handleUndo}
                      className="flex items-center gap-1.5 px-3 py-1 bg-white border border-[#d2dec0] hover:bg-[#e4ebd8] rounded-lg font-medium transition cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Undo Action
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setUndoMessage(null);
                      setUndoToken(null);
                    }}
                    className="p-1 text-[#6b7362] hover:text-[#1e2419] hover:bg-[#e4ebd8] rounded-lg transition cursor-pointer"
                    title="Dismiss notification"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* File Table / Grid Container */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={(e) => {
                e.preventDefault();
                if (!e.currentTarget.contains(e.relatedTarget)) setDragActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (e.dataTransfer.files) handleFileUpload(e.dataTransfer.files);
              }}
              className="flex-1 min-h-0 overflow-y-auto px-6 py-2 relative"
            >
              {dragActive && (
                <div className="absolute inset-4 bg-[#f2f6ea]/90 border-2 border-dashed border-[#4d602c] rounded-2xl flex flex-col items-center justify-center text-[#4d602c] font-semibold text-sm z-20">
                  <Plus className="w-8 h-8 mb-2 animate-bounce" />
                  Drop files to upload directly here
                </div>
              )}

              {loadingFiles ? (
                <div className="h-64 flex items-center justify-center text-xs text-[#8a9282]">
                  Loading files from Drive...
                </div>
              ) : visibleFiles.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-xs text-[#8a9282] gap-2">
                  <Folder className="w-8 h-8 text-[#d8dfcb]" />
                  <span>No files or folders found</span>
                </div>
              ) : viewMode === 'grid' ? (
                /* Grid View */
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 py-3">
                  {visibleFiles.map((item) => {
                    const isSelected = selectedFileIds.has(item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => item.isFolder && navigateToFolder(item)}
                        className={`group relative p-3 rounded-2xl border transition cursor-pointer flex flex-col justify-between aspect-square ${
                          isSelected
                            ? 'bg-[#edf2e4] border-[#4d602c]'
                            : 'bg-white border-[#e5e8e1] hover:border-[#4d602c]/50 hover:bg-[#fbfcf9]'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectFile(item.id)}
                              className="rounded text-[#4d602c] focus:ring-[#4d602c]"
                            />
                          </div>
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={(e) => handleToggleStar(item, e)}
                              className={`p-1 rounded hover:bg-[#f2f4ef] transition cursor-pointer ${
                                item.starred ? 'text-amber-500' : 'text-[#8a9282] opacity-0 group-hover:opacity-100'
                              }`}
                              title={item.starred ? 'Unstar' : 'Star'}
                            >
                              <Star className={`w-3.5 h-3.5 ${item.starred ? 'fill-amber-500' : ''}`} />
                            </button>
                            <button
                              onClick={(e) => handleOpenShareModal(item, e)}
                              className="p-1 rounded hover:bg-[#f2f4ef] text-[#8a9282] hover:text-[#4d602c] opacity-0 group-hover:opacity-100 transition cursor-pointer"
                              title="Share"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </button>
                            {selectedNav === 'trash' || item.trashed ? (
                              <>
                                <button
                                  onClick={(e) => handleToggleTrash(item, e)}
                                  className="p-1 rounded hover:bg-[#f2f4ef] text-[#4d602c] opacity-0 group-hover:opacity-100 transition cursor-pointer"
                                  title="Restore to Drive"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => handleDeletePermanently(item, e)}
                                  className="p-1 rounded hover:bg-rose-50 text-rose-600 opacity-0 group-hover:opacity-100 transition cursor-pointer"
                                  title="Delete permanently"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={(e) => handleToggleTrash(item, e)}
                                className="p-1 rounded hover:bg-rose-50 text-[#8a9282] hover:text-rose-600 opacity-0 group-hover:opacity-100 transition cursor-pointer"
                                title="Move to Trash"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {item.webViewLink && (
                              <a
                                href={item.webViewLink}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-[#8a9282] hover:text-[#4d602c] p-1 opacity-0 group-hover:opacity-100 transition"
                                title="Open in Drive"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-center justify-center py-2 text-center">
                          <div className="mb-2 scale-125">{getFileIcon(item)}</div>
                          <span className="font-medium text-xs text-[#1e2419] truncate w-full group-hover:text-[#4d602c]">
                            {item.name}
                          </span>
                        </div>

                        <div className="text-[10px] text-[#8a9282] flex items-center justify-between pt-1 border-t border-[#f2f4ef]">
                          <span>{formatSize(item.size)}</span>
                          <span>{formatDate(item.modifiedTime)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Table View */
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-white z-10 border-b border-[#f0f2eb]">
                    <tr className="border-b border-[#f0f2eb] text-[#8a9282] font-semibold">
                      <th className="py-2.5 px-2 w-8">
                        <input
                          type="checkbox"
                          checked={selectedFileIds.size === visibleFiles.length && visibleFiles.length > 0}
                          onChange={toggleSelectAll}
                          className="rounded text-[#4d602c] focus:ring-[#4d602c]"
                        />
                      </th>
                      <th className="py-2.5 px-2">Name ↑</th>
                      <th className="py-2.5 px-2 w-28">Size</th>
                      <th className="py-2.5 px-2 w-32">Modified</th>
                      <th className="py-2.5 px-2 w-24 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f7f8f6]">
                    {visibleFiles.map((item) => {
                      const isSelected = selectedFileIds.has(item.id);
                      return (
                        <tr
                          key={item.id}
                          onClick={() => item.isFolder && navigateToFolder(item)}
                          className={`hover:bg-[#f7f8f6] transition group cursor-pointer ${
                            isSelected ? 'bg-[#edf2e4]' : ''
                          }`}
                        >
                          <td className="py-3 px-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectFile(item.id)}
                              className="rounded text-[#4d602c] focus:ring-[#4d602c]"
                            />
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-3">
                              {getFileIcon(item)}
                              <span className="font-medium text-[#1e2419] truncate max-w-md group-hover:text-[#4d602c] transition">
                                {item.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-[#8a9282]">{formatSize(item.size)}</td>
                          <td className="py-3 px-2 text-[#8a9282]">{formatDate(item.modifiedTime)}</td>
                          <td className="py-3 px-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={(e) => handleToggleStar(item, e)}
                                className={`p-1 rounded hover:bg-[#f2f4ef] transition cursor-pointer ${
                                  item.starred ? 'text-amber-500' : 'text-[#8a9282] opacity-0 group-hover:opacity-100'
                                }`}
                                title={item.starred ? 'Unstar' : 'Star'}
                              >
                                <Star className={`w-3.5 h-3.5 ${item.starred ? 'fill-amber-500' : ''}`} />
                              </button>
                              <button
                                onClick={(e) => handleOpenShareModal(item, e)}
                                className="p-1 rounded hover:bg-[#f2f4ef] text-[#8a9282] hover:text-[#4d602c] opacity-0 group-hover:opacity-100 transition cursor-pointer"
                                title="Share"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                              </button>
                              {selectedNav === 'trash' || item.trashed ? (
                                <>
                                  <button
                                    onClick={(e) => handleToggleTrash(item, e)}
                                    className="p-1 rounded hover:bg-[#f2f4ef] text-[#4d602c] opacity-0 group-hover:opacity-100 transition cursor-pointer"
                                    title="Restore to Drive"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) => handleDeletePermanently(item, e)}
                                    className="p-1 rounded hover:bg-rose-50 text-rose-600 opacity-0 group-hover:opacity-100 transition cursor-pointer"
                                    title="Delete permanently"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={(e) => handleToggleTrash(item, e)}
                                  className="p-1 rounded hover:bg-rose-50 text-[#8a9282] hover:text-rose-600 opacity-0 group-hover:opacity-100 transition cursor-pointer"
                                  title="Move to Trash"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {item.webViewLink && (
                                <a
                                  href={item.webViewLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[#8a9282] hover:text-[#4d602c] p-1 inline-block"
                                  title="Open in Google Drive"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </main>

          {/* Draggable Divider between My Drive and Assistant */}
          {assistantOpen && (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setIsResizing(true);
              }}
              className={`w-1.5 -ml-1 z-20 cursor-col-resize transition-all select-none relative ${
                isResizing ? 'bg-[#4d602c]' : 'bg-transparent hover:bg-[#4d602c]/20'
              }`}
              title="Drag left or right to resize My Drive & Assistant"
            />
          )}

          {/* ================= RIGHT: ASSISTANT PANEL ================= */}
          {assistantOpen && (
            <aside
              style={{ width: `${assistantWidth}px` }}
              className="bg-white border-l border-[#e5e8e1] flex flex-col flex-shrink-0 h-full overflow-hidden"
            >
              {/* Header */}
              <div className="px-5 py-4 border-b border-[#e5e8e1] flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#4d602c]" />
                  <h3 className="font-semibold text-sm text-[#1e2419]">Assistant</h3>
                </div>
                <button
                  onClick={() => setAssistantOpen(false)}
                  className="p-1 rounded-lg text-[#8a9282] hover:bg-[#f2f4ef] transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Tabs: Suggestions vs Activity */}
              <div className="flex border-b border-[#e5e8e1] px-5 text-xs font-semibold flex-shrink-0">
                <button
                  onClick={() => setActiveTab('suggestions')}
                  className={`py-3 mr-4 transition relative cursor-pointer ${
                    activeTab === 'suggestions' ? 'text-[#4d602c]' : 'text-[#8a9282] hover:text-[#1e2419]'
                  }`}
                >
                  Suggestions
                  {activeTab === 'suggestions' && <div className="h-0.5 bg-[#4d602c] absolute bottom-0 left-0 right-0" />}
                </button>
                <button
                  onClick={() => setActiveTab('activity')}
                  className={`py-3 transition relative cursor-pointer ${
                    activeTab === 'activity' ? 'text-[#4d602c]' : 'text-[#8a9282] hover:text-[#1e2419]'
                  }`}
                >
                  Activity
                  {chatLog.length > 0 && <span className="ml-1 px-1.5 py-0.2 bg-[#4d602c] text-white rounded-full text-[9px]">{chatLog.length}</span>}
                  {activeTab === 'activity' && <div className="h-0.5 bg-[#4d602c] absolute bottom-0 left-0 right-0" />}
                </button>
              </div>

              {/* Panel Body */}
              <div className="flex-1 min-h-0 overflow-y-auto p-5 text-xs space-y-4">
                {activeTab === 'suggestions' ? (
                  <div>
                    <p className="font-semibold text-[#1e2419] mb-3 text-xs">What would you like to do?</p>
                    <div className="space-y-2">
                      {suggestions.map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => openAssistantWith(item.text)}
                          className="w-full flex items-center justify-between p-3 rounded-xl border border-[#e5e8e1] hover:border-[#4d602c] hover:bg-[#f7f8f6] transition text-left group cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 text-[#2c3327]">
                            <span className="p-1.5 rounded-lg bg-[#f2f5ed] text-[#4d602c] group-hover:bg-[#4d602c] group-hover:text-white transition">
                              <Sparkles className="w-3.5 h-3.5" />
                            </span>
                            <span className="font-medium">{item.text}</span>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-[#8a9282] group-hover:text-[#4d602c]" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Activity / Chat Log */
                  <div className="space-y-3">
                    {chatLog.length === 0 ? (
                      <p className="text-center text-[#8a9282] py-8">No conversation yet. Ask a question below!</p>
                    ) : (
                      chatLog.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 leading-relaxed ${
                              msg.role === 'user'
                                ? 'bg-[#4d602c] text-white whitespace-pre-wrap'
                                : 'bg-[#f7f8f6] border border-[#e5e8e1] text-[#1e2419]'
                            }`}
                          >
                            {msg.role === 'user' ? (
                              msg.text
                            ) : (
                              <FormattedMessage text={msg.text} />
                            )}
                          </div>
                        </div>
                      ))
                    )}

                    {analyzing && (
                      <div className="flex items-center gap-2 text-[#8a9282] italic bg-[#f7f8f6] p-3 rounded-xl">
                        <Sparkles className="w-3.5 h-3.5 text-[#4d602c] animate-spin" />
                        <span>Analyzing files & planning...</span>
                      </div>
                    )}

                    {/* Proposed Plan Review Card */}
                    {proposedPlan && (
                      <div className="bg-[#fcfdfa] border-2 border-[#4d602c] rounded-2xl p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#4d602c] flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            Proposed Plan
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-[#edf2e4] text-[#3d4d23] font-semibold text-[10px]">
                            {proposedPlan.operations.length} actions
                          </span>
                        </div>

                        <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                          {proposedPlan.operations.map((op) => (
                            <div key={op.id} className="p-2 bg-white rounded-lg border border-[#e5e8e1] text-[11px]">
                              {op.type === 'CREATE_FOLDER' && (
                                <p className="font-medium text-amber-700">Create folder: {op.folder_name}</p>
                              )}
                              {op.type === 'MOVE_FILE' && (
                                <p className="text-[#1e2419]">
                                  Move <strong>{op.file_name}</strong> &rarr; <span className="text-[#4d602c] font-medium">{op.target_folder_name}</span>
                                </p>
                              )}
                              {op.type === 'CREATE_DOC' && (
                                <p className="text-[#1e2419]">
                                  Create Doc: <strong>{op.doc_title}</strong>
                                </p>
                              )}
                              {op.type === 'SHARE_FILE' && (
                                <p className="text-[#1e2419]">
                                  Share <strong>{op.file_name}</strong> with <span className="font-medium">{op.email}</span> ({op.role})
                                </p>
                              )}
                              {op.type === 'DELETE_FILE' && (
                                <div className="flex items-center gap-1.5 text-rose-600 font-medium">
                                  <Trash2 className="w-3.5 h-3.5 flex-shrink-0" />
                                  <span>Permanently delete file: <strong>{op.file_name}</strong></span>
                                </div>
                              )}
                              {op.type === 'DELETE_FOLDER' && (
                                <div className="flex items-center gap-1.5 text-rose-600 font-medium">
                                  <Trash2 className="w-3.5 h-3.5 flex-shrink-0" />
                                  <span>Permanently delete folder: <strong>{op.folder_name}</strong></span>
                                </div>
                              )}
                              {op.reason && <p className="text-[10px] text-[#8a9282] italic mt-0.5">{op.reason}</p>}
                            </div>
                          ))}
                        </div>

                        {proposedPlan.operations.some(op => ['DELETE_FILE', 'DELETE_FOLDER'].includes(op.type)) && (
                          <div className="bg-rose-50 border border-rose-200 rounded-xl p-2 text-[11px] text-rose-700 font-medium flex items-center gap-1.5">
                            <Trash2 className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>Warning: This plan contains permanent file/folder deletions.</span>
                          </div>
                        )}

                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={handleExecutePlan}
                            disabled={executing}
                            className={`flex-1 py-2 text-white rounded-xl font-medium transition cursor-pointer text-xs ${
                              proposedPlan.operations.some(op => ['DELETE_FILE', 'DELETE_FOLDER'].includes(op.type))
                                ? 'bg-rose-600 hover:bg-rose-700'
                                : 'bg-[#4d602c] hover:bg-[#3f4f24]'
                            }`}
                          >
                            {executing ? 'Executing...' : proposedPlan.operations.some(op => ['DELETE_FILE', 'DELETE_FOLDER'].includes(op.type)) ? 'Approve & Delete Permanently' : 'Approve & Execute'}
                          </button>
                          <button
                            onClick={() => setProposedPlan(null)}
                            disabled={executing}
                            className="px-3 py-2 bg-white border border-[#e5e8e1] hover:bg-[#f7f8f6] rounded-xl text-[#6b7362] cursor-pointer text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}
              </div>

              {/* Chat Input Bar */}
              <div className="p-4 border-t border-[#e5e8e1] flex-shrink-0 bg-white">
                <form onSubmit={handleSendMessage} className="relative">
                  <div className="border border-[#e5e8e1] focus-within:border-[#4d602c] rounded-2xl bg-[#fcfdfa] p-2 transition">
                    <textarea
                      ref={promptInputRef}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage(e);
                        }
                      }}
                      placeholder="Ask or describe what you want to do..."
                      rows={2}
                      className="w-full bg-transparent text-xs text-[#1e2419] placeholder-[#8a9282] resize-none outline-none"
                    />

                    <div className="flex items-center justify-between pt-1 border-t border-[#f2f4ef]">
                      {/* Left: Attach & Mic */}
                      <div className="flex items-center gap-1">
                        <label className="p-1 text-[#8a9282] hover:text-[#1e2419] rounded cursor-pointer" title="Attach file to upload">
                          <Paperclip className="w-3.5 h-3.5" />
                          <input
                            type="file"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              handleFileUpload(Array.from(e.target.files));
                              e.target.value = '';
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={toggleVoiceInput}
                          className={`p-1 rounded cursor-pointer ${
                            isListening ? 'text-rose-600 bg-rose-50 animate-pulse' : 'text-[#8a9282] hover:text-[#1e2419]'
                          }`}
                          title="Speak command"
                        >
                          {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      {/* Right: Send */}
                      <button
                        type="submit"
                        disabled={!prompt.trim() || analyzing}
                        className="w-7 h-7 bg-[#4d602c] hover:bg-[#3f4f24] text-white rounded-lg flex items-center justify-center disabled:opacity-40 transition cursor-pointer shadow-sm"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </form>

                {/* Example Quick Pills */}
                <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto text-[10px]">
                  <span className="text-[#8a9282] font-semibold flex-shrink-0">Examples:</span>
                  {['Find large files', 'Organize PDFs', 'Move files'].map((pill) => (
                    <button
                      key={pill}
                      onClick={() => openAssistantWith(pill)}
                      className="px-2 py-0.5 bg-[#f2f5ed] hover:bg-[#e4ebdb] text-[#4d602c] rounded-md whitespace-nowrap transition cursor-pointer"
                    >
                      {pill}
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          )}
        </div>
      )}

      {/* ================= MODALS ================= */}

      {/* Duplicates Modal */}
      {duplicatesModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-[#e5e8e1] rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between pb-4 border-b border-[#f0f2eb]">
              <div className="flex items-center gap-2 text-[#4d602c]">
                <Copy className="w-5 h-5" />
                <h3 className="font-bold text-base text-[#1e2419]">Duplicate Files Detection</h3>
              </div>
              <button
                onClick={() => setDuplicatesModal(false)}
                className="text-[#8a9282] hover:text-[#1e2419] text-xs px-2.5 py-1 rounded-lg bg-[#f7f8f6] cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {scanningDuplicates ? (
                <div className="text-center py-8 text-[#8a9282] text-xs animate-pulse">
                  Comparing MD5 checksums and file sizes...
                </div>
              ) : duplicateList.length === 0 ? (
                <div className="text-center py-8 text-[#4d602c] text-xs font-medium">
                  🎉 No duplicate files found in this folder!
                </div>
              ) : (
                duplicateList.map((item, idx) => (
                  <div key={idx} className="bg-[#fcfdfa] p-3 rounded-xl border border-[#e5e8e1] text-xs space-y-2">
                    <div className="text-[#1e2419] font-medium flex items-center justify-between">
                      <span className="truncate">Original: <strong>{item.primary.name}</strong></span>
                      <span className="text-[#8a9282] font-mono text-[10px]">MD5 match</span>
                    </div>
                    <div className="pl-3 border-l-2 border-[#4d602c]/40 space-y-1">
                      {item.duplicates.map((dup) => (
                        <div key={dup.id} className="text-[#4d602c] flex items-center justify-between">
                          <span className="truncate">Duplicate: {dup.name}</span>
                          <span className="text-[10px] text-[#8a9282]">{(dup.size / 1024).toFixed(1)} KB</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-[#f0f2eb] flex justify-end">
              <button
                onClick={() => setDuplicatesModal(false)}
                className="px-4 py-2 bg-[#4d602c] hover:bg-[#3f4f24] text-white text-xs rounded-xl font-medium cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Clean Schedule Modal */}
      {scheduleModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-[#e5e8e1] rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#f0f2eb]">
              <div className="flex items-center gap-2 text-[#4d602c]">
                <Clock className="w-5 h-5" />
                <h3 className="font-bold text-base text-[#1e2419]">Schedule Auto-Clean</h3>
              </div>
              <button
                onClick={() => setScheduleModal(false)}
                className="text-[#8a9282] hover:text-[#1e2419] text-xs px-2.5 py-1 rounded-lg bg-[#f7f8f6] cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="py-4 space-y-4 text-xs">
              <div>
                <label className="block text-[#6b7362] mb-1 font-medium">Frequency</label>
                <select
                  value={scheduleCron}
                  onChange={(e) => setScheduleCron(e.target.value)}
                  className="w-full bg-[#fcfdfa] border border-[#e5e8e1] rounded-xl p-2.5 text-[#1e2419] outline-none"
                >
                  <option value="every_friday">Every Friday at 5:00 PM</option>
                  <option value="every_day">Daily at Midnight (12:00 AM)</option>
                  <option value="every_hour">Hourly Maintenance Sweep</option>
                </select>
              </div>

              <div>
                <label className="block text-[#6b7362] mb-1 font-medium">Target Archive Folder</label>
                <input
                  type="text"
                  value={scheduleFolder}
                  onChange={(e) => setScheduleFolder(e.target.value)}
                  placeholder="e.g. Weekly Archive"
                  className="w-full bg-[#fcfdfa] border border-[#e5e8e1] rounded-xl p-2.5 text-[#1e2419] outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setScheduleModal(false)}
                  className="px-4 py-2 bg-white border border-[#e5e8e1] hover:bg-[#f7f8f6] rounded-xl text-[#6b7362] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#4d602c] hover:bg-[#3f4f24] text-white rounded-xl font-medium cursor-pointer"
                >
                  Activate Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {deleteAccountModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-rose-100 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 pb-3 border-b border-rose-100 text-rose-600">
              <div className="p-2 bg-rose-50 rounded-xl text-rose-500">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-[#1e2419]">Delete Account & Data</h3>
                <p className="text-xs text-[#8a9282]">Permanent account disconnection</p>
              </div>
            </div>

            <div className="py-4 space-y-3 text-xs text-[#6b7362] leading-relaxed">
              <p>Are you sure you want to delete your account? This action will:</p>
              <ul className="list-disc pl-5 space-y-1 text-[#1e2419]">
                <li>Revoke Google OAuth token immediately</li>
                <li>Wipe user session and undo history from storage</li>
                <li>Log you out completely</li>
              </ul>
              <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-xl text-rose-700 text-[11px]">
                Your files in Google Drive will remain safe and untouched.
              </div>
            </div>

            <div className="pt-3 border-t border-[#f0f2eb] flex justify-end gap-2">
              <button
                type="button"
                disabled={deletingAccount}
                onClick={() => setDeleteAccountModal(false)}
                className="px-4 py-2 bg-white border border-[#e5e8e1] hover:bg-[#f7f8f6] rounded-xl text-[#6b7362] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingAccount}
                onClick={handleDeleteAccount}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-medium cursor-pointer transition disabled:opacity-50"
              >
                {deletingAccount ? 'Deleting...' : 'Yes, Delete My Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {newFolderModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-[#e5e8e1] rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="font-bold text-base text-[#1e2419] mb-4 flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-[#4d602c]" />
              New Folder
            </h3>
            <form onSubmit={handleCreateFolder} className="space-y-4">
              <input
                type="text"
                autoFocus
                placeholder="Folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="w-full p-2.5 text-xs bg-[#f7f8f6] border border-[#e5e8e1] rounded-xl focus:outline-none focus:border-[#4d602c]"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setNewFolderModal(false)}
                  className="px-4 py-2 bg-white border border-[#e5e8e1] rounded-xl text-xs text-[#6b7362] hover:bg-[#f7f8f6] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newFolderName.trim() || creatingFolder}
                  className="px-4 py-2 bg-[#4d602c] hover:bg-[#3f4f24] text-white rounded-xl text-xs font-medium transition cursor-pointer disabled:opacity-50"
                >
                  {creatingFolder ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {shareModal && sharingFile && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-[#e5e8e1] rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#e5e8e1]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#edf2e4] text-[#4d602c] flex items-center justify-center">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#1e2419]">Share "{sharingFile.name}"</h3>
                  <p className="text-[11px] text-[#8a9282]">Add people with Google Drive access</p>
                </div>
              </div>
              <button
                onClick={() => setShareModal(false)}
                className="p-1 rounded-lg text-[#8a9282] hover:bg-[#f7f8f6] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleShareItem} className="py-4 space-y-4 text-xs">
              <div>
                <label className="block text-[#6b7362] mb-1.5 font-medium">Recipient Email Address</label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  placeholder="collaborator@example.com"
                  className="w-full bg-[#fcfdfa] border border-[#e5e8e1] rounded-xl p-2.5 text-[#1e2419] outline-none focus:border-[#4d602c]"
                />
              </div>

              <div>
                <label className="block text-[#6b7362] mb-1.5 font-medium">Access Role</label>
                <select
                  value={shareRole}
                  onChange={(e) => setShareRole(e.target.value)}
                  className="w-full bg-[#fcfdfa] border border-[#e5e8e1] rounded-xl p-2.5 text-[#1e2419] outline-none focus:border-[#4d602c]"
                >
                  <option value="reader">Viewer (Can view and download)</option>
                  <option value="commenter">Commenter (Can add comments)</option>
                  <option value="writer">Editor (Can edit and organize)</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShareModal(false)}
                  className="px-4 py-2 bg-white border border-[#e5e8e1] hover:bg-[#f7f8f6] rounded-xl text-[#6b7362] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!shareEmail.trim() || sharingLoading}
                  className="px-4 py-2 bg-[#4d602c] hover:bg-[#3f4f24] text-white rounded-xl font-medium transition cursor-pointer disabled:opacity-50"
                >
                  {sharingLoading ? 'Sharing...' : 'Send Access'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
