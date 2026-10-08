import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Folder,
  FileText,
  CheckCircle,
  RotateCcw,
  Send,
  HardDrive,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  FolderPlus,
  FileSpreadsheet,
  FileImage,
  Plus,
  UploadCloud,
  Copy,
  Clock,
  FileCheck,
  Share2,
  Mic,
  MicOff,
  Search,
  X,
  PanelRight,
  ArrowUpDown
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api';

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

  // Chat & Agent state
  const [prompt, setPrompt] = useState('');
  const [chatLog, setChatLog] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [proposedPlan, setProposedPlan] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [undoToken, setUndoToken] = useState(null);
  const [undoMessage, setUndoMessage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [duplicatesModal, setDuplicatesModal] = useState(false);
  const [duplicateList, setDuplicateList] = useState([]);
  const [scanningDuplicates, setScanningDuplicates] = useState(false);
  const [scheduleModal, setScheduleModal] = useState(false);
  const [scheduleCron, setScheduleCron] = useState('every_friday');
  const [scheduleFolder, setScheduleFolder] = useState('Weekly Archive');
  const [scheduleNotice, setScheduleNotice] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [deleteAccountModal, setDeleteAccountModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const chatEndRef = useRef(null);
  const promptInputRef = useRef(null);
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [organizeMenu, setOrganizeMenu] = useState(false);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [sortMenu, setSortMenu] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chatLog, analyzing, proposedPlan]);

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
      fetchFiles(currentFolder);
    }
  }, [sessionId, currentFolder]);

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

  const fetchFiles = async (folderId) => {
    setLoadingFiles(true);
    try {
      const res = await axios.get(`${API_BASE}/drive/files?folder_id=${folderId}&session_id=${sessionId}`);
      setFiles(res.data.files || []);
    } catch (err) {
      console.error('Error fetching files:', err);
    } finally {
      setLoadingFiles(false);
    }
  };

  const navigateToFolder = (folder) => {
    setCurrentFolder(folder.id);
    setFolderHistory((prev) => [...prev, folder]);
  };

  const navigateBreadcrumb = (index) => {
    const target = folderHistory[index];
    setFolderHistory((prev) => prev.slice(0, index + 1));
    setCurrentFolder(target.id);
  };

  // Agent Chat & Proposal
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!prompt.trim() || analyzing) return;

    const userMessage = prompt;
    setPrompt('');
    setChatLog((prev) => [...prev, { role: 'user', text: userMessage }]);
    setAnalyzing(true);
    setProposedPlan(null);
    setReviewing(false);

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
        { role: 'assistant', text: `Request failed: ${err.response?.data?.detail || err.message}` }
      ]);
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice recognition is not supported in this browser. Please use Google Chrome or Edge.");
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

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setPrompt(transcript);
        setIsListening(false);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
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
      // Refresh folder contents
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
      alert(res.data.message);
      setUndoToken(null);
      setUndoMessage(null);
      fetchFiles(currentFolder);
    } catch (err) {
      alert(`Undo failed: ${err.message}`);
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
      { role: 'assistant', text: `Uploaded ${successCount} file(s) to this folder.` }
    ]);
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
      setScheduleNotice(res.data.message);
      setScheduleModal(false);
      setChatLog((prev) => [
        ...prev,
        { role: 'assistant', text: res.data.message }
      ]);
    } catch (err) {
      alert(`Schedule error: ${err.message}`);
    }
  };

  const getFileIcon = (item) => {
    const cls = 'w-4 h-4 flex-shrink-0';
    if (item.isFolder) return <Folder className={`${cls} text-ink-soft fill-hover`} />;
    if (item.mimeType.includes('pdf')) return <FileText className={`${cls} text-rose-500`} />;
    if (item.mimeType.includes('spreadsheet') || item.mimeType.includes('sheet')) return <FileSpreadsheet className={`${cls} text-emerald-600`} />;
    if (item.mimeType.includes('image')) return <FileImage className={`${cls} text-amber-600`} />;
    return <FileText className={`${cls} text-sky-600`} />;
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    const n = Number(bytes);
    if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(n / 1024))} KB`;
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const sortLabels = { name: 'Name', size: 'Size', modified: 'Modified' };

  const visibleFiles = files
    .filter((f) => f.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      if (sortKey === 'size') return (Number(b.size) || 0) - (Number(a.size) || 0);
      if (sortKey === 'modified') return (b.modifiedTime || '').localeCompare(a.modifiedTime || '');
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

  const suggestions = [
    'Find all invoice PDFs',
    'Group placement documents',
    'Find duplicate files',
    'Create a folder for images'
  ];

  const summarizePlan = (ops) => {
    const lines = [];
    const folders = ops.filter((o) => o.type === 'CREATE_FOLDER');
    const moves = ops.filter((o) => o.type === 'MOVE_FILE');
    const shares = ops.filter((o) => o.type === 'SHARE_FILE');
    const docs = ops.filter((o) => o.type === 'CREATE_DOC');
    const pdfs = ops.filter((o) => o.type === 'EXPORT_PDF');
    if (folders.length) lines.push(`Create ${folders.length} folder${folders.length > 1 ? 's' : ''}`);
    if (moves.length) {
      const targets = [...new Set(moves.map((m) => m.target_folder_name).filter(Boolean))];
      lines.push(`Move ${moves.length} file${moves.length > 1 ? 's' : ''}${targets.length ? ` to ${targets.join(', ')}` : ''}`);
    }
    if (shares.length) lines.push(`Share ${shares.length} file${shares.length > 1 ? 's' : ''}`);
    if (docs.length) lines.push(`Create ${docs.length} document${docs.length > 1 ? 's' : ''}`);
    if (pdfs.length) lines.push(`Export ${pdfs.length} file${pdfs.length > 1 ? 's' : ''} as PDF`);
    return lines;
  };

  const describeOp = (op) => {
    switch (op.type) {
      case 'CREATE_FOLDER': return `Create folder: ${op.folder_name}`;
      case 'MOVE_FILE': return `Move ${op.file_name} → ${op.target_folder_name}`;
      case 'SHARE_FILE': return `Share ${op.file_name} with ${op.email} (${op.role})`;
      case 'CREATE_DOC': return `Create document: ${op.doc_title || op.file_name}`;
      case 'EXPORT_PDF': return `Export as PDF: ${op.file_name}`;
      default: return op.type;
    }
  };

  const openAssistantWith = (text) => {
    setAssistantOpen(true);
    if (text) setPrompt(text);
    setTimeout(() => promptInputRef.current?.focus(), 0);
  };

  const modalShell = 'fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50';
  const modalCard = 'bg-white border border-line rounded-xl w-full p-5 shadow-xl';

  const assistantPanel = (
    <aside className="w-full lg:w-80 flex-shrink-0 min-h-0 h-[32rem] lg:h-auto flex flex-col border-t lg:border-t-0 lg:border-l border-line bg-white">
      <div className="h-12 px-4 border-b border-line flex items-center justify-between flex-shrink-0">
        <h2 className="font-semibold text-sm">Assistant</h2>
        <button
          onClick={() => setAssistantOpen(false)}
          className="p-1.5 rounded-md text-ink-mute hover:bg-hover hover:text-ink cursor-pointer"
          title="Collapse assistant"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 text-[13px]">
        {chatLog.length === 0 && !analyzing && !proposedPlan && (
          <div>
            <p className="text-ink mb-3">What would you like to do?</p>
            <ul className="border-t border-line">
              {suggestions.map((s) => (
                <li key={s}>
                  <button
                    onClick={() => openAssistantWith(s)}
                    className="w-full text-left py-2 border-b border-line text-ink-soft hover:text-ink hover:bg-sub px-1 cursor-pointer"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-3">
          {chatLog.map((msg, i) => (
            msg.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[90%] bg-hover text-ink rounded-lg px-3 py-2 whitespace-pre-wrap break-words">
                  {msg.text}
                </div>
              </div>
            ) : (
              <p key={i} className="text-ink-soft leading-relaxed whitespace-pre-wrap break-words">
                {msg.text}
              </p>
            )
          ))}

          {analyzing && <p className="text-ink-mute">Searching files...</p>}

          {/* Action review */}
          {proposedPlan && (
            <div className="border-t border-line pt-3">
              <p className="text-xs text-ink-mute mb-1">
                {proposedPlan.operations.length} change{proposedPlan.operations.length > 1 ? 's' : ''} ready for review
              </p>
              <ul className="text-ink space-y-0.5 mb-2">
                {summarizePlan(proposedPlan.operations).map((line) => (
                  <li key={line} className="font-medium">{line}</li>
                ))}
              </ul>

              {reviewing && (
                <ul className="mb-3 border-t border-line max-h-56 overflow-y-auto">
                  {proposedPlan.operations.map((op) => (
                    <li key={op.id} className="py-1.5 border-b border-line text-ink-soft break-words">
                      {describeOp(op)}
                      {op.reason && <span className="block text-xs text-ink-mute">{op.reason}</span>}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={() => { setProposedPlan(null); setReviewing(false); }}
                  disabled={executing}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                {reviewing ? (
                  <button onClick={handleExecutePlan} disabled={executing} className="btn btn-primary">
                    {executing ? 'Applying...' : 'Apply changes'}
                  </button>
                ) : (
                  <button onClick={() => setReviewing(true)} className="btn btn-primary">
                    Review changes
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        <div ref={chatEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="p-3 border-t border-line flex-shrink-0">
        <div className="flex items-center gap-1 border border-line rounded-lg pl-3 pr-1 focus-within:border-accent">
          <input
            ref={promptInputRef}
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={isListening ? 'Listening...' : 'Ask about your files...'}
            className="flex-1 min-w-0 bg-transparent text-[13px] placeholder-ink-mute outline-none py-2"
            disabled={analyzing}
          />
          <button
            type="button"
            onClick={toggleVoiceInput}
            disabled={analyzing}
            title={isListening ? 'Stop listening' : 'Speak your request'}
            className={`p-1.5 rounded-md cursor-pointer ${
              isListening ? 'text-rose-600 bg-rose-50' : 'text-ink-mute hover:text-ink hover:bg-hover'
            }`}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        </div>
        <div className="flex justify-end mt-2">
          <button type="submit" disabled={!prompt.trim() || analyzing} className="btn btn-primary">
            <Send className="w-3.5 h-3.5" />
            Send
          </button>
        </div>
      </form>
    </aside>
  );

  return (
    <div className="min-h-screen lg:h-screen flex flex-col bg-white text-ink">
      {/* Header */}
      <header className="h-12 border-b border-line px-4 flex items-center gap-4 flex-shrink-0 sticky top-0 bg-white z-20">
        <div className="flex items-center gap-2 flex-shrink-0">
          <HardDrive className="w-5 h-5 text-ink-soft" />
          <h1 className="font-semibold text-[15px]">Smart Drive</h1>
        </div>

        {sessionId && (
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-ink-mute absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files..."
              className="field !pl-8 !bg-sub !border-transparent focus:!bg-white focus:!border-accent"
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-3 flex-shrink-0">
          {sessionId && !assistantOpen && (
            <button onClick={() => openAssistantWith()} className="btn btn-secondary">
              <PanelRight className="w-4 h-4" />
              <span className="hidden sm:inline">Assistant</span>
            </button>
          )}
          {sessionId && userProfile && (
            <>
              <div className="flex items-center gap-2">
                {userProfile.photoLink ? (
                  <img src={userProfile.photoLink} alt={userProfile.displayName} className="w-6 h-6 rounded-full" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-hover text-ink-soft flex items-center justify-center text-xs font-semibold">
                    {userProfile.displayName?.charAt(0) || 'U'}
                  </div>
                )}
                <span className="hidden md:inline text-[13px] text-ink-soft max-w-[160px] truncate">
                  {userProfile.displayName || userProfile.emailAddress}
                </span>
              </div>
              <button onClick={handleLogout} className="text-[13px] text-ink-soft hover:text-ink cursor-pointer">
                Sign out
              </button>
            </>
          )}
        </div>
      </header>

      {/* Connection screen */}
      {!sessionId ? (
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <HardDrive className="w-8 h-8 text-ink-soft mx-auto mb-4" />
            <h2 className="text-2xl font-semibold mb-1">Smart Drive</h2>
            <p className="text-[15px] font-medium mb-2">Connect Google Drive</p>
            <p className="text-[13px] text-ink-soft leading-relaxed mb-6">
              Smart Drive needs access to your Drive to organize files, find duplicates, and perform requested actions.
            </p>
            <button onClick={handleGoogleLogin} className="btn btn-primary !h-10 !px-5 !text-sm">
              Connect Google Drive
            </button>
            <p className="text-xs text-ink-mute mt-4">You can disconnect your account at any time.</p>
          </div>
        </main>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* File manager */}
          <main className="flex-1 min-w-0 min-h-[24rem] flex flex-col">
            {/* Title + actions */}
            <div className="px-6 pt-5 pb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div className="min-w-0">
                <nav className="flex items-center flex-wrap text-xl font-semibold">
                  {folderHistory.map((folder, idx) => (
                    <React.Fragment key={folder.id}>
                      {idx > 0 && <ChevronRight className="w-4 h-4 text-ink-mute mx-1.5 flex-shrink-0" />}
                      <button
                        onClick={() => navigateBreadcrumb(idx)}
                        className={`cursor-pointer hover:underline underline-offset-4 ${
                          idx === folderHistory.length - 1 ? 'text-ink' : 'text-ink-soft font-medium'
                        }`}
                      >
                        {folder.name}
                      </button>
                    </React.Fragment>
                  ))}
                </nav>
                <p className="text-[13px] text-ink-mute mt-0.5">
                  {loadingFiles
                    ? 'Loading...'
                    : search.trim()
                      ? `${visibleFiles.length} of ${files.length} items`
                      : `${files.length} item${files.length === 1 ? '' : 's'}`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className={`btn btn-primary ${uploading ? 'opacity-60' : ''}`}>
                  <Plus className="w-4 h-4" />
                  <span>{uploading ? 'Uploading...' : 'Upload'}</span>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => { handleFileUpload(Array.from(e.target.files)); e.target.value = ''; }}
                  />
                </label>

                <div className="relative">
                  <button onClick={() => setOrganizeMenu((v) => !v)} className="btn btn-secondary">
                    Organize
                    <ChevronDown className="w-3.5 h-3.5 text-ink-mute" />
                  </button>
                  {organizeMenu && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setOrganizeMenu(false)} />
                      <div className="menu absolute right-0 top-full mt-1 z-40">
                        <button className="menu-item" onClick={() => { setOrganizeMenu(false); handleScanDuplicates(); }}>
                          <Copy className="w-4 h-4 text-ink-mute" /> Find duplicates
                        </button>
                        <button className="menu-item" onClick={() => { setOrganizeMenu(false); setScheduleModal(true); }}>
                          <Clock className="w-4 h-4 text-ink-mute" /> Clean up
                        </button>
                        <button className="menu-item" onClick={() => { setOrganizeMenu(false); openAssistantWith(); }}>
                          <FolderPlus className="w-4 h-4 text-ink-mute" /> Organize with Assistant
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <button
                  onClick={() => fetchFiles(currentFolder)}
                  className="btn btn-text"
                  title="Refresh folder"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingFiles ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              </div>
            </div>

            {/* Undo notice */}
            {undoMessage && (
              <div className="mx-6 mb-2 px-3 py-2 border border-line bg-sub rounded-lg flex items-center justify-between gap-3 text-[13px]">
                <span className="flex items-center gap-2 min-w-0 text-ink-soft">
                  <CheckCircle className="w-4 h-4 text-accent flex-shrink-0" />
                  <span className="truncate">{undoMessage}</span>
                </span>
                {undoToken && (
                  <button onClick={handleUndo} className="btn btn-secondary !h-7 flex-shrink-0">
                    <RotateCcw className="w-3.5 h-3.5" />
                    Undo
                  </button>
                )}
              </div>
            )}

            {/* Table */}
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
              className="relative flex-1 min-h-0 flex flex-col"
            >
              <div className="grid grid-cols-[1fr_5rem] sm:grid-cols-[1fr_6rem_6rem] items-center gap-3 px-6 h-9 border-y border-line bg-sub text-xs text-ink-soft font-medium flex-shrink-0">
                <span>Name</span>
                <span className="text-right">Size</span>
                <span className="hidden sm:flex items-center justify-end relative">
                  <button
                    onClick={() => setSortMenu((v) => !v)}
                    className="flex items-center gap-1 hover:text-ink cursor-pointer"
                    title="Sort"
                  >
                    Modified
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                  {sortMenu && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setSortMenu(false)} />
                      <div className="menu absolute right-0 top-full mt-1 z-40 !min-w-[150px] font-normal">
                        <p className="px-2.5 py-1 text-[11px] text-ink-mute">Sort by</p>
                        {Object.entries(sortLabels).map(([key, label]) => (
                          <button
                            key={key}
                            className="menu-item"
                            onClick={() => { setSortKey(key); setSortMenu(false); }}
                          >
                            <span className={sortKey === key ? 'text-accent font-medium' : ''}>{label}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </span>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto">
                {dragActive && (
                  <div className="sticky top-0 z-10 m-3 py-6 border border-dashed border-accent bg-accent-soft rounded-lg text-center text-[13px] text-accent pointer-events-none">
                    Drop files to upload to this folder
                  </div>
                )}
                {loadingFiles ? (
                  <div className="flex items-center justify-center h-48 text-ink-mute text-[13px]">Loading...</div>
                ) : visibleFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-ink-mute text-[13px]">
                    <Folder className="w-8 h-8 stroke-1 mb-2" />
                    {search.trim() ? 'No files match your search.' : 'This folder is empty.'}
                  </div>
                ) : (
                  visibleFiles.map((file) => (
                    <div
                      key={file.id}
                      onClick={() => file.isFolder && navigateToFolder(file)}
                      className={`group grid grid-cols-[1fr_5rem] sm:grid-cols-[1fr_6rem_6rem] items-center gap-3 px-6 h-10 border-b border-line hover:bg-hover ${
                        file.isFolder ? 'cursor-pointer' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {getFileIcon(file)}
                        <span className="truncate text-[13px]">{file.name}</span>
                        {file.webViewLink && (
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="opacity-0 group-hover:opacity-100 text-ink-mute hover:text-ink flex-shrink-0"
                            title="Open in Drive"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                      <span className="text-right text-xs text-ink-soft tabular-nums">
                        {file.isFolder ? '' : formatSize(file.size)}
                      </span>
                      <span className="hidden sm:block text-right text-xs text-ink-soft">
                        {formatDate(file.modifiedTime)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </main>

          {assistantOpen && assistantPanel}
        </div>
      )}

      {/* Duplicates Modal */}
      {duplicatesModal && (
        <div className={modalShell}>
          <div className={`${modalCard} max-w-lg flex flex-col max-h-[80vh]`}>
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h3 className="font-semibold text-base">Duplicate files</h3>
              <button
                onClick={() => setDuplicatesModal(false)}
                className="p-1.5 rounded-md text-ink-mute hover:bg-hover hover:text-ink cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3">
              {scanningDuplicates ? (
                <p className="text-center py-8 text-ink-mute text-[13px]">Comparing checksums...</p>
              ) : duplicateList.length === 0 ? (
                <p className="text-center py-8 text-ink-soft text-[13px]">No duplicate files found in this folder.</p>
              ) : (
                duplicateList.map((item, idx) => (
                  <div key={idx} className="py-2.5 border-b border-line last:border-b-0 text-[13px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{item.primary.name}</span>
                      <span className="text-xs text-ink-mute flex-shrink-0">Original</span>
                    </div>
                    <div className="mt-1 pl-3 border-l border-line space-y-0.5">
                      {item.duplicates.map((dup) => (
                        <div key={dup.id} className="flex items-center justify-between gap-2 text-ink-soft">
                          <span className="truncate">{dup.name}</span>
                          <span className="text-xs text-ink-mute flex-shrink-0">{formatSize(dup.size)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-line flex justify-end">
              <button onClick={() => setDuplicatesModal(false)} className="btn btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Clean up (schedule) Modal */}
      {scheduleModal && (
        <div className={modalShell}>
          <div className={`${modalCard} max-w-md`}>
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h3 className="font-semibold text-base">Clean up</h3>
              <button
                onClick={() => setScheduleModal(false)}
                className="p-1.5 rounded-md text-ink-mute hover:bg-hover hover:text-ink cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="pt-4 space-y-4 text-[13px]">
              <div>
                <label className="block text-ink-soft mb-1">Frequency</label>
                <select value={scheduleCron} onChange={(e) => setScheduleCron(e.target.value)} className="field">
                  <option value="every_friday">Every Friday at 5:00 PM</option>
                  <option value="every_day">Daily at midnight</option>
                  <option value="every_hour">Hourly</option>
                </select>
              </div>

              <div>
                <label className="block text-ink-soft mb-1">Archive folder</label>
                <input
                  type="text"
                  value={scheduleFolder}
                  onChange={(e) => setScheduleFolder(e.target.value)}
                  placeholder="e.g. Weekly Archive"
                  className="field"
                />
              </div>

              <p className="text-xs text-ink-mute leading-relaxed">
                Files left loose in My Drive are moved into this folder on the schedule above.
              </p>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setScheduleModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Save schedule</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
