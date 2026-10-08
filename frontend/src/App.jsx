import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Folder, 
  FileText, 
  ArrowRight, 
  CheckCircle, 
  RotateCcw, 
  Sparkles, 
  Send, 
  HardDrive, 
  RefreshCw, 
  ExternalLink,
  ChevronRight,
  FolderPlus,
  FileSpreadsheet,
  FileImage,
  AlertCircle,
  Upload,
  UploadCloud,
  Copy,
  Users,
  Clock,
  Trash2,
  FileCheck,
  Share2,
  Mic,
  MicOff
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
  const [chatLog, setChatLog] = useState([
    {
      role: 'assistant',
      text: "👋 Hi! I'm your AI Drive Assistant. Tell me what to organize, e.g.:\n• 'Find all invoice PDFs and move them to a new 2026 Invoices folder'\n• 'Group loose images into a Photos folder'"
    }
  ]);
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
        { role: 'assistant', text: `⚠️ Error analyzing: ${err.response?.data?.detail || err.message}` }
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
      { role: 'assistant', text: `✅ Uploaded ${successCount} file(s) into the current folder. You can now ask me to organize or sort them!` }
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
        { role: 'assistant', text: `⏰ ${res.data.message}` }
      ]);
    } catch (err) {
      alert(`Schedule error: ${err.message}`);
    }
  };

  const getFileIcon = (item) => {
    const box = 'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ';
    if (item.isFolder) return <div className={box + 'bg-moss-100 text-moss-600'}><Folder className="w-[18px] h-[18px]" /></div>;
    if (item.mimeType.includes('pdf')) return <div className={box + 'bg-rose-50 text-rose-500'}><FileText className="w-[18px] h-[18px]" /></div>;
    if (item.mimeType.includes('spreadsheet') || item.mimeType.includes('sheet')) return <div className={box + 'bg-emerald-50 text-emerald-600'}><FileSpreadsheet className="w-[18px] h-[18px]" /></div>;
    if (item.mimeType.includes('image')) return <div className={box + 'bg-amber-50 text-amber-600'}><FileImage className="w-[18px] h-[18px]" /></div>;
    return <div className={box + 'bg-sky-50 text-sky-600'}><FileText className="w-[18px] h-[18px]" /></div>;
  };

  const modalShell = 'fixed inset-0 bg-moss-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50';
  const modalCard = 'bg-white border border-moss-100 rounded-2xl w-full p-6 shadow-2xl shadow-moss-900/20';
  const inputCls = 'w-full bg-white border border-moss-200 rounded-lg p-2.5 text-ink outline-none focus:border-moss-500 focus:ring-2 focus:ring-moss-200 transition';

  return (
    <div className="min-h-screen lg:h-screen flex flex-col text-ink">
      {/* Top Header */}
      <header className="border-b border-moss-100 bg-white/80 backdrop-blur px-4 sm:px-6 py-3 flex items-center justify-between gap-3 sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 btn-primary rounded-xl flex-shrink-0">
            <HardDrive className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-base sm:text-lg tracking-tight flex items-center gap-2 flex-wrap">
              Smart Drive Assistant
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-moss-100 text-moss-700 border border-moss-200">
                Gemini Powered
              </span>
            </h1>
            <p className="text-xs text-ink-soft truncate">Autonomous file sorting, organization &amp; cleanup</p>
          </div>
        </div>

        {sessionId && userProfile ? (
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-2.5 bg-white pl-1.5 pr-3 py-1 rounded-full border border-moss-200">
              {userProfile.photoLink ? (
                <img src={userProfile.photoLink} alt={userProfile.displayName} className="w-7 h-7 rounded-full" />
              ) : (
                <div className="w-7 h-7 rounded-full btn-primary flex items-center justify-center text-xs font-bold">
                  {userProfile.displayName?.charAt(0) || 'U'}
                </div>
              )}
              <span className="hidden sm:inline text-sm font-medium max-w-[160px] truncate">{userProfile.displayName || userProfile.emailAddress}</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs font-medium text-ink-soft hover:text-ink transition cursor-pointer"
            >
              Sign Out
            </button>
            <span className="text-moss-200 text-xs">|</span>
            <button
              onClick={() => setDeleteAccountModal(true)}
              className="text-xs font-medium text-rose-500 hover:text-rose-700 hover:underline transition cursor-pointer flex items-center gap-1"
              title="Delete account & disconnect Drive completely"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Account</span>
            </button>
          </div>
        ) : (
          <button
            onClick={handleGoogleLogin}
            className="btn-primary flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm cursor-pointer flex-shrink-0"
          >
            <span>Connect Google Drive</span>
          </button>
        )}
      </header>

      {/* Main Body */}
      {!sessionId ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md card p-8 rounded-3xl">
            <div className="w-16 h-16 btn-primary rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Sparkles className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight mb-2">Connect Your Google Drive</h2>
            <p className="text-sm text-ink-soft mb-6 leading-relaxed">
              Automate Drive organization with natural language. Organize receipts, group client files, and auto-create folders with safe dry-run approval.
            </p>
            <button
              onClick={handleGoogleLogin}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium cursor-pointer"
            >
              <span>Authorize with Google OAuth</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 p-4">
          {/* Left Panel: Drive File Explorer */}
          <section className="flex-1 min-w-0 min-h-[24rem] flex flex-col card rounded-2xl overflow-hidden">
            {/* Breadcrumb + toolbar */}
            <div className="px-4 py-3 border-b border-moss-100 bg-moss-50/60 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <nav className="flex items-center text-sm overflow-x-auto min-w-0">
                {folderHistory.map((folder, idx) => (
                  <React.Fragment key={folder.id}>
                    {idx > 0 && <ChevronRight className="w-4 h-4 text-moss-300 mx-1 flex-shrink-0" />}
                    <button
                      onClick={() => navigateBreadcrumb(idx)}
                      className={`hover:text-moss-700 transition font-medium whitespace-nowrap cursor-pointer ${
                        idx === folderHistory.length - 1 ? 'text-moss-700' : 'text-ink-soft'
                      }`}
                    >
                      {folder.name}
                    </button>
                  </React.Fragment>
                ))}
              </nav>

              <div className="flex flex-wrap items-center gap-2">
                <label className="btn-primary flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer">
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>{uploading ? 'Uploading...' : 'Upload'}</span>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => handleFileUpload(e.target.files)}
                  />
                </label>

                <button
                  onClick={handleScanDuplicates}
                  className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                  title="Find duplicate files by MD5 checksum"
                >
                  <Copy className="w-3.5 h-3.5 text-moss-500" />
                  <span>Duplicates</span>
                </button>

                <button
                  onClick={() => setScheduleModal(true)}
                  className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                  title="Schedule automated periodic cleanup"
                >
                  <Clock className="w-3.5 h-3.5 text-moss-500" />
                  <span>Auto-Clean</span>
                </button>

                <button
                  onClick={() => fetchFiles(currentFolder)}
                  className="p-1.5 text-ink-soft hover:text-moss-700 rounded-lg hover:bg-moss-100 transition cursor-pointer"
                  title="Refresh folder"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingFiles ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Undo Notification Bar */}
            {undoMessage && (
              <div className="bg-moss-100 border-b border-moss-200 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-moss-800">
                <span className="flex items-center gap-1.5 min-w-0">
                  <CheckCircle className="w-4 h-4 text-moss-600 flex-shrink-0" />
                  <span className="truncate">{undoMessage}</span>
                </span>
                {undoToken && (
                  <button
                    onClick={handleUndo}
                    className="flex items-center gap-1 bg-white hover:bg-moss-50 border border-moss-300 px-2.5 py-1 rounded-md text-moss-800 transition cursor-pointer font-medium flex-shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Undo
                  </button>
                )}
              </div>
            )}

            {/* File List / Drag-and-Drop Dropzone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={(e) => {
                e.preventDefault();
                if (!e.currentTarget.contains(e.relatedTarget)) setDragActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (e.dataTransfer.files) {
                  handleFileUpload(e.dataTransfer.files);
                }
              }}
              className="relative flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5"
            >
              {dragActive && (
                <div className="sticky top-0 left-0 right-0 z-10 pointer-events-none flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-moss-500 bg-moss-50/95 text-moss-700 font-medium text-sm py-8">
                  <UploadCloud className="w-10 h-10 mb-2" />
                  Drop files to upload to this folder
                </div>
              )}
              {loadingFiles ? (
                <div className="flex items-center justify-center h-48 text-ink-mute text-sm">
                  Loading Drive files...
                </div>
              ) : files.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-ink-mute text-sm">
                  <Folder className="w-10 h-10 stroke-1 text-moss-300 mb-2" />
                  No files or folders found here.
                </div>
              ) : (
                files.map((file) => (
                  <div
                    key={file.id}
                    onClick={() => file.isFolder && navigateToFolder(file)}
                    className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border border-transparent hover:bg-moss-50 hover:border-moss-200 transition ${
                      file.isFolder ? 'cursor-pointer' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {getFileIcon(file)}
                      <span className="text-sm font-medium truncate">{file.name}</span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-ink-mute flex-shrink-0">
                      {file.isFolder ? (
                        <span>Folder</span>
                      ) : (
                        <span className="tabular-nums">{file.size ? `${(file.size / 1024).toFixed(1)} KB` : ''}</span>
                      )}
                      {file.webViewLink && (
                        <a
                          href={file.webViewLink}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded hover:bg-moss-100 hover:text-moss-700 transition"
                          title="Open in Drive"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Right Panel: AI Chat & Plan Review */}
          <aside className="w-full lg:w-[440px] h-[36rem] lg:h-auto flex-shrink-0 min-h-0 flex flex-col card rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-moss-100 bg-moss-50/60 flex items-center gap-2">
              <div className="p-1.5 btn-primary rounded-lg"><Sparkles className="w-3.5 h-3.5" /></div>
              <h2 className="font-semibold text-sm">AI Organizer Assistant</h2>
            </div>

            {/* Chat Conversation */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 text-sm">
              {chatLog.map((msg, i) => (
                <div
                  key={i}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl px-3.5 py-3 leading-relaxed whitespace-pre-wrap break-words ${
                      msg.role === 'user'
                        ? 'btn-primary rounded-br-md'
                        : 'bg-moss-50 text-ink border border-moss-100 rounded-bl-md'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}

              {analyzing && (
                <div className="flex items-center gap-2 text-ink-soft text-xs italic bg-moss-50 p-3 rounded-xl border border-moss-100">
                  <Sparkles className="w-4 h-4 text-moss-500 animate-pulse" />
                  <span>Scanning files &amp; planning reorganization...</span>
                </div>
              )}

              {/* Dry Run Plan Card */}
              {proposedPlan && (
                <div className="bg-white border border-moss-300 rounded-2xl p-4 shadow-lg shadow-moss-900/10 ring-4 ring-moss-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-moss-700 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Proposed Plan (Dry-Run)
                    </span>
                    <span className="text-xs bg-moss-100 text-moss-800 px-2 py-0.5 rounded-full font-medium">
                      {proposedPlan.operations.length} actions
                    </span>
                  </div>

                  <p className="text-xs text-ink-soft mb-3 leading-relaxed">
                    Review the actions below before applying changes to your Drive:
                  </p>

                  <div className="space-y-2 mb-4 max-h-52 overflow-y-auto pr-1">
                    {proposedPlan.operations.map((op) => (
                      <div
                        key={op.id}
                        className="p-2.5 rounded-lg bg-moss-50 border border-moss-100 text-xs flex flex-col gap-1"
                      >
                        {op.type === 'CREATE_FOLDER' && (
                          <div className="flex items-center gap-2 text-moss-800 font-medium">
                            <FolderPlus className="w-4 h-4 text-moss-600 flex-shrink-0" />
                            <span>Create folder: <strong>{op.folder_name}</strong></span>
                          </div>
                        )}
                        {op.type === 'MOVE_FILE' && (
                          <div className="flex items-center gap-2">
                            <ArrowRight className="w-4 h-4 text-moss-600 flex-shrink-0" />
                            <span className="truncate">
                              Move <strong>{op.file_name}</strong> &rarr; <span className="text-moss-700 font-medium">{op.target_folder_name}</span>
                            </span>
                          </div>
                        )}
                        {op.type === 'SHARE_FILE' && (
                          <div className="flex items-center gap-2 text-sky-700">
                            <Share2 className="w-4 h-4 text-sky-600 flex-shrink-0" />
                            <span className="truncate">
                              Share <strong>{op.file_name}</strong> with <strong>{op.email}</strong> ({op.role})
                            </span>
                          </div>
                        )}
                        {op.type === 'CREATE_DOC' && (
                          <div className="flex items-center gap-2 text-sky-700">
                            <FileText className="w-4 h-4 text-sky-600 flex-shrink-0" />
                            <span>Create Google Doc: <strong>{op.doc_title || op.file_name}</strong></span>
                          </div>
                        )}
                        {op.type === 'EXPORT_PDF' && (
                          <div className="flex items-center gap-2 text-rose-700">
                            <FileCheck className="w-4 h-4 text-rose-500 flex-shrink-0" />
                            <span>Export as PDF: <strong>{op.file_name}</strong></span>
                          </div>
                        )}
                        {op.reason && (
                          <span className="text-[11px] text-ink-mute italic pl-6">{op.reason}</span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleExecutePlan}
                      disabled={executing}
                      className="btn-primary flex-1 text-xs font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>{executing ? 'Executing...' : 'Approve & Execute'}</span>
                    </button>
                    <button
                      onClick={() => setProposedPlan(null)}
                      disabled={executing}
                      className="btn-ghost px-4 text-xs font-semibold py-2.5 rounded-xl cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Bar */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-moss-100 bg-moss-50/60">
              <div className="flex items-center gap-1 bg-white border border-moss-200 rounded-xl pl-3 pr-1.5 py-1 focus-within:border-moss-500 focus-within:ring-2 focus-within:ring-moss-200 transition">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={isListening ? 'Listening... speak now...' : 'Ask or speak to organize, sort, create folders...'}
                  className="w-full bg-transparent text-sm text-ink placeholder-ink-mute outline-none py-1.5"
                  disabled={analyzing}
                />

                {/* Voice / Mic Button */}
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  disabled={analyzing}
                  title={isListening ? 'Stop listening' : 'Speak your command'}
                  className={`p-2 rounded-lg transition cursor-pointer ${
                    isListening
                      ? 'bg-rose-50 text-rose-600 border border-rose-200 animate-pulse'
                      : 'text-ink-soft hover:text-moss-700 hover:bg-moss-50'
                  }`}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                <button
                  type="submit"
                  disabled={!prompt.trim() || analyzing}
                  className="btn-primary p-2 rounded-lg cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}

      {/* Duplicates Modal */}
      {duplicatesModal && (
        <div className={modalShell}>
          <div className={`${modalCard} max-w-lg flex flex-col max-h-[80vh]`}>
            <div className="flex items-center justify-between pb-4 border-b border-moss-100">
              <div className="flex items-center gap-2 text-moss-700">
                <Copy className="w-5 h-5" />
                <h3 className="font-bold text-base text-ink">Duplicate Files Detection</h3>
              </div>
              <button
                onClick={() => setDuplicatesModal(false)}
                className="btn-ghost text-xs px-2.5 py-1 rounded-md cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {scanningDuplicates ? (
                <div className="text-center py-8 text-ink-soft text-sm animate-pulse">
                  Comparing MD5 checksums and file sizes...
                </div>
              ) : duplicateList.length === 0 ? (
                <div className="text-center py-8 text-moss-700 text-sm font-medium">
                  🎉 No duplicate files found in this folder!
                </div>
              ) : (
                duplicateList.map((item, idx) => (
                  <div key={idx} className="bg-moss-50 p-3 rounded-xl border border-moss-100 text-xs space-y-2">
                    <div className="font-medium flex items-center justify-between gap-2">
                      <span className="truncate">Original: <strong>{item.primary.name}</strong></span>
                      <span className="text-ink-mute font-mono text-[10px] flex-shrink-0">MD5 match</span>
                    </div>
                    <div className="pl-3 border-l-2 border-moss-400 space-y-1">
                      {item.duplicates.map((dup) => (
                        <div key={dup.id} className="text-moss-800 flex items-center justify-between gap-2">
                          <span className="truncate">Duplicate: {dup.name}</span>
                          <span className="text-[10px] text-ink-mute flex-shrink-0">{(dup.size / 1024).toFixed(1)} KB</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-moss-100 flex justify-end">
              <button
                onClick={() => setDuplicatesModal(false)}
                className="btn-primary text-xs px-4 py-2 rounded-lg font-medium cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Clean Schedule Modal */}
      {scheduleModal && (
        <div className={modalShell}>
          <div className={`${modalCard} max-w-md`}>
            <div className="flex items-center justify-between pb-4 border-b border-moss-100">
              <div className="flex items-center gap-2 text-moss-700">
                <Clock className="w-5 h-5" />
                <h3 className="font-bold text-base text-ink">Schedule Auto-Clean</h3>
              </div>
              <button
                onClick={() => setScheduleModal(false)}
                className="btn-ghost text-xs px-2.5 py-1 rounded-md cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="py-4 space-y-4 text-xs">
              <div>
                <label className="block text-ink-soft mb-1 font-medium">Frequency</label>
                <select
                  value={scheduleCron}
                  onChange={(e) => setScheduleCron(e.target.value)}
                  className={inputCls}
                >
                  <option value="every_friday">Every Friday at 5:00 PM</option>
                  <option value="every_day">Daily at Midnight (12:00 AM)</option>
                  <option value="every_hour">Hourly Maintenance Sweep</option>
                </select>
              </div>

              <div>
                <label className="block text-ink-soft mb-1 font-medium">Target Archive Folder</label>
                <input
                  type="text"
                  value={scheduleFolder}
                  onChange={(e) => setScheduleFolder(e.target.value)}
                  placeholder="e.g. Weekly Archive"
                  className={inputCls}
                />
              </div>

              <p className="text-[11px] text-ink-mute leading-relaxed">
                The assistant will automatically sweep unorganized root files into this folder on schedule.
              </p>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setScheduleModal(false)}
                  className="btn-ghost px-4 py-2 rounded-lg font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary px-4 py-2 rounded-lg font-medium cursor-pointer"
                >
                  Activate Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      {deleteAccountModal && (
        <div className={modalShell}>
          <div className={`${modalCard} max-w-md`}>
            <div className="flex items-center gap-3 pb-3 border-b border-rose-100 text-rose-600">
              <div className="p-2 bg-rose-50 rounded-xl text-rose-500">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-ink">Delete Account & Data</h3>
                <p className="text-xs text-ink-soft">Permanent account disconnection</p>
              </div>
            </div>

            <div className="py-4 space-y-3 text-xs text-ink-soft leading-relaxed">
              <p>
                Are you sure you want to delete your account? This action will:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-ink">
                <li><strong>Revoke Google OAuth Access:</strong> Disconnect Smart Drive Assistant from your Google account immediately.</li>
                <li><strong>Purge All Stored Data:</strong> Permanently delete your user profile, session tokens, and undo history from our database and disk.</li>
                <li><strong>Log You Out Completely:</strong> Clear all local browser storage and return to the login screen.</li>
              </ul>
              <div className="bg-rose-50 border border-rose-200/80 p-3 rounded-xl text-rose-700 text-[11px]">
                ⚠️ Your files in Google Drive will remain safe and untouched, but Smart Drive Assistant will no longer have permission to access them.
              </div>
            </div>

            <div className="pt-3 border-t border-moss-100 flex justify-end gap-2">
              <button
                type="button"
                disabled={deletingAccount}
                onClick={() => setDeleteAccountModal(false)}
                className="btn-ghost px-4 py-2 rounded-lg font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingAccount}
                onClick={handleDeleteAccount}
                className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-lg font-medium cursor-pointer shadow-lg shadow-rose-600/20 transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deletingAccount ? 'Deleting...' : 'Yes, Delete My Account'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
