import React, { useState, useEffect } from 'react';
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
  Share2
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
    if (item.isFolder) return <Folder className="w-5 h-5 text-amber-400" />;
    if (item.mimeType.includes('pdf')) return <FileText className="w-5 h-5 text-rose-400" />;
    if (item.mimeType.includes('spreadsheet') || item.mimeType.includes('sheet')) return <FileSpreadsheet className="w-5 h-5 text-emerald-400" />;
    if (item.mimeType.includes('image')) return <FileImage className="w-5 h-5 text-purple-400" />;
    return <FileText className="w-5 h-5 text-blue-400" />;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-lg border border-indigo-500/30">
            <HardDrive className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-wide flex items-center gap-2">
              Smart Drive Assistant
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Gemini Powered
              </span>
            </h1>
            <p className="text-xs text-slate-400">Autonomous file sorting, organization & cleanup</p>
          </div>
        </div>

        {sessionId && userProfile ? (
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700">
              {userProfile.photoLink ? (
                <img src={userProfile.photoLink} alt={userProfile.displayName} className="w-7 h-7 rounded-full" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold">
                  {userProfile.displayName?.charAt(0) || 'U'}
                </div>
              )}
              <span className="text-sm font-medium pr-1">{userProfile.displayName || userProfile.emailAddress}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="text-xs text-slate-400 hover:text-rose-400 transition"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <button
            onClick={handleGoogleLogin}
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium text-sm transition shadow-lg shadow-indigo-600/20 cursor-pointer"
          >
            <span>Connect Google Drive</span>
          </button>
        )}
      </header>

      {/* Main Body */}
      {!sessionId ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl">
            <div className="w-16 h-16 bg-indigo-600/10 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-indigo-500/20">
              <Sparkles className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Connect Your Google Drive</h2>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              Automate Drive organization with natural language. Organize receipts, group client files, and auto-create folders with safe dry-run approval.
            </p>
            <button
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-medium transition shadow-lg shadow-indigo-600/20 cursor-pointer"
            >
              <span>Authorize with Google OAuth</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Left Panel: Drive File Explorer */}
          <section className="flex-1 flex flex-col border-r border-slate-800 bg-slate-950/50">
            {/* Breadcrumb Bar */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/30">
              <nav className="flex items-center space-x-1 text-sm overflow-x-auto">
                {folderHistory.map((folder, idx) => (
                  <React.Fragment key={folder.id}>
                    {idx > 0 && <ChevronRight className="w-4 h-4 text-slate-600 mx-1 flex-shrink-0" />}
                    <button
                      onClick={() => navigateBreadcrumb(idx)}
                      className={`hover:text-indigo-400 transition font-medium whitespace-nowrap cursor-pointer ${
                        idx === folderHistory.length - 1 ? 'text-indigo-400' : 'text-slate-400'
                      }`}
                    >
                      {folder.name}
                    </button>
                  </React.Fragment>
                ))}
              </nav>

              <div className="flex items-center space-x-2">
                <label className="flex items-center space-x-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition">
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>{uploading ? 'Uploading...' : 'Upload Files'}</span>
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
                  className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition"
                  title="Find duplicate files by MD5 checksum"
                >
                  <Copy className="w-3.5 h-3.5 text-amber-400" />
                  <span>Find Duplicates</span>
                </button>

                <button
                  onClick={() => setScheduleModal(true)}
                  className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition"
                  title="Schedule automated periodic cleanup"
                >
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Auto-Clean Schedule</span>
                </button>

                <button
                  onClick={() => fetchFiles(currentFolder)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
                  title="Refresh folder"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingFiles ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Undo Notification Bar */}
            {undoMessage && (
              <div className="bg-emerald-950/60 border-b border-emerald-800/40 px-4 py-2.5 flex items-center justify-between text-xs text-emerald-300">
                <span className="flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  {undoMessage}
                </span>
                {undoToken && (
                  <button
                    onClick={handleUndo}
                    className="flex items-center gap-1 bg-emerald-800/60 hover:bg-emerald-700/60 px-2.5 py-1 rounded text-emerald-200 transition cursor-pointer font-medium"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Undo Action
                  </button>
                )}
              </div>
            )}

            {/* File List / Drag-and-Drop Dropzone */}
            <div 
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (e.dataTransfer.files) {
                  handleFileUpload(e.dataTransfer.files);
                }
              }}
              className={`flex-1 overflow-y-auto p-4 space-y-1.5 transition ${
                dragActive ? 'bg-indigo-950/30 border-2 border-dashed border-indigo-500 m-2 rounded-2xl' : ''
              }`}
            >
              {dragActive && (
                <div className="flex flex-col items-center justify-center p-8 text-indigo-400 font-medium text-sm animate-pulse">
                  <UploadCloud className="w-10 h-10 mb-2" />
                  Drop files to upload directly to this Google Drive folder
                </div>
              )}
              {loadingFiles ? (
                <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
                  Loading Drive files...
                </div>
              ) : files.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-sm">
                  <Folder className="w-10 h-10 stroke-1 text-slate-700 mb-2" />
                  No files or folders found here.
                </div>
              ) : (
                files.map((file) => (
                  <div
                    key={file.id}
                    onClick={() => file.isFolder && navigateToFolder(file)}
                    className={`flex items-center justify-between p-3 rounded-xl border border-slate-800/60 bg-slate-900/30 hover:bg-slate-800/50 hover:border-slate-700 transition ${
                      file.isFolder ? 'cursor-pointer' : ''
                    }`}
                  >
                    <div className="flex items-center space-x-3 truncate">
                      {getFileIcon(file)}
                      <span className="text-sm font-medium truncate text-slate-200">{file.name}</span>
                    </div>

                    <div className="flex items-center space-x-3 text-xs text-slate-500 flex-shrink-0">
                      {file.isFolder ? (
                        <span className="text-slate-500 font-mono">Folder</span>
                      ) : (
                        <span>{file.size ? `${(file.size / 1024).toFixed(1)} KB` : ''}</span>
                      )}
                      {file.webViewLink && (
                        <a
                          href={file.webViewLink}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-indigo-400 transition"
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
          <aside className="w-full lg:w-[440px] flex flex-col border-t lg:border-t-0 border-slate-800 bg-slate-900/40">
            <div className="p-4 border-b border-slate-800 flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <h2 className="font-semibold text-sm">AI Organizer Assistant</h2>
            </div>

            {/* Chat Conversation */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
              {chatLog.map((msg, i) => (
                <div
                  key={i}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl p-3.5 leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-none'
                        : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-bl-none'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}

              {analyzing && (
                <div className="flex items-center space-x-2 text-slate-400 text-xs italic bg-slate-800/40 p-3 rounded-xl border border-slate-800">
                  <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
                  <span>Scanning files & planning reorganization...</span>
                </div>
              )}

              {/* Dry Run Plan Card */}
              {proposedPlan && (
                <div className="mt-4 bg-slate-800/95 border-2 border-indigo-500/50 rounded-2xl p-4 shadow-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Proposed Plan (Dry-Run)
                    </span>
                    <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full font-mono">
                      {proposedPlan.operations.length} actions
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 mb-3 leading-relaxed">
                    Review the actions below before applying changes to your Drive:
                  </p>

                  <div className="space-y-2 mb-4 max-h-52 overflow-y-auto pr-1">
                    {proposedPlan.operations.map((op) => (
                      <div
                        key={op.id}
                        className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-700/60 text-xs flex flex-col gap-1"
                      >
                        {op.type === 'CREATE_FOLDER' && (
                          <div className="flex items-center gap-2 text-amber-300 font-medium">
                            <FolderPlus className="w-4 h-4 text-amber-400 flex-shrink-0" />
                            <span>Create folder: <strong>{op.folder_name}</strong></span>
                          </div>
                        )}
                        {op.type === 'MOVE_FILE' && (
                          <div className="flex items-center gap-2 text-slate-200">
                            <ArrowRight className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                            <span className="truncate">
                              Move <strong className="text-slate-100">{op.file_name}</strong> &rarr; <span className="text-indigo-300">{op.target_folder_name}</span>
                            </span>
                          </div>
                        )}
                        {op.type === 'SHARE_FILE' && (
                          <div className="flex items-center gap-2 text-sky-300">
                            <Share2 className="w-4 h-4 text-sky-400 flex-shrink-0" />
                            <span className="truncate">
                              Share <strong className="text-slate-100">{op.file_name}</strong> with <strong className="text-sky-200">{op.email}</strong> ({op.role})
                            </span>
                          </div>
                        )}
                        {op.type === 'CREATE_DOC' && (
                          <div className="flex items-center gap-2 text-blue-300">
                            <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
                            <span>Create Google Doc: <strong>{op.doc_title || op.file_name}</strong></span>
                          </div>
                        )}
                        {op.type === 'EXPORT_PDF' && (
                          <div className="flex items-center gap-2 text-rose-300">
                            <FileCheck className="w-4 h-4 text-rose-400 flex-shrink-0" />
                            <span>Export as PDF: <strong>{op.file_name}</strong></span>
                          </div>
                        )}
                        {op.reason && (
                          <span className="text-[10px] text-slate-500 italic pl-6">{op.reason}</span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={handleExecutePlan}
                      disabled={executing}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2.5 rounded-xl transition flex items-center justify-center space-x-1 cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>{executing ? 'Executing...' : 'Approve & Execute'}</span>
                    </button>
                    <button
                      onClick={() => setProposedPlan(null)}
                      disabled={executing}
                      className="px-3 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-semibold py-2.5 rounded-xl transition cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Input Bar */}
            <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-800 bg-slate-900/70">
              <div className="flex items-center bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 focus-within:border-indigo-500 transition">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ask to organize, sort, create folders..."
                  className="w-full bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none py-1.5"
                  disabled={analyzing}
                />
                <button
                  type="submit"
                  disabled={!prompt.trim() || analyzing}
                  className="p-1.5 text-indigo-400 hover:text-indigo-300 disabled:opacity-40 transition cursor-pointer"
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-2 text-amber-400">
                <Copy className="w-5 h-5" />
                <h3 className="font-bold text-base text-slate-100">Duplicate Files Detection</h3>
              </div>
              <button 
                onClick={() => setDuplicatesModal(false)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-800 cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {scanningDuplicates ? (
                <div className="text-center py-8 text-slate-400 text-sm animate-pulse">
                  Comparing MD5 checksums and file sizes...
                </div>
              ) : duplicateList.length === 0 ? (
                <div className="text-center py-8 text-emerald-400 text-sm">
                  🎉 No duplicate files found in this folder!
                </div>
              ) : (
                duplicateList.map((item, idx) => (
                  <div key={idx} className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-2">
                    <div className="text-slate-300 font-medium flex items-center justify-between">
                      <span className="truncate">Original: <strong>{item.primary.name}</strong></span>
                      <span className="text-slate-500 font-mono text-[10px]">MD5 match</span>
                    </div>
                    <div className="pl-3 border-l-2 border-amber-500/40 space-y-1">
                      {item.duplicates.map((dup) => (
                        <div key={dup.id} className="text-amber-300/80 flex items-center justify-between">
                          <span className="truncate">Duplicate: {dup.name}</span>
                          <span className="text-[10px] text-slate-500">{(dup.size / 1024).toFixed(1)} KB</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setDuplicatesModal(false)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 py-2 rounded-lg font-medium cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Clean Schedule Modal */}
      {scheduleModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-2 text-emerald-400">
                <Clock className="w-5 h-5" />
                <h3 className="font-bold text-base text-slate-100">Schedule Auto-Clean</h3>
              </div>
              <button 
                onClick={() => setScheduleModal(false)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-800 cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="py-4 space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-medium">Frequency</label>
                <select
                  value={scheduleCron}
                  onChange={(e) => setScheduleCron(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none"
                >
                  <option value="every_friday">Every Friday at 5:00 PM</option>
                  <option value="every_day">Daily at Midnight (12:00 AM)</option>
                  <option value="every_hour">Hourly Maintenance Sweep</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Target Archive Folder</label>
                <input
                  type="text"
                  value={scheduleFolder}
                  onChange={(e) => setScheduleFolder(e.target.value)}
                  placeholder="e.g. Weekly Archive"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none"
                />
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                The assistant will automatically sweep unorganized root files into this folder on schedule.
              </p>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setScheduleModal(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium cursor-pointer shadow-lg shadow-emerald-600/20"
                >
                  Activate Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
