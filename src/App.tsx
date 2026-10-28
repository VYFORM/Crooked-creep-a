import React, { useState, useEffect, useMemo } from 'react';
import {
  Github,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Folder,
  FileCode,
  FileText,
  ChevronRight,
  ExternalLink,
  Copy,
  Check,
  Terminal,
  Lock,
  Globe,
  Shield,
  Layers,
  ArrowRight,
  HelpCircle,
  HardDrive,
  File,
  Code2,
  Trash2,
  Sparkles,
} from 'lucide-react';

interface ProjectFile {
  path: string;
  size: number;
  isBinary: boolean;
}

interface GitHubUser {
  login: string;
  name: string;
  avatar_url: string;
  html_url: string;
  public_repos: number;
  total_private_repos: number;
  email?: string;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
  description: string | null;
  updated_at: string;
}

export default function App() {
  // Navigation / Tabs
  const [activeTab, setActiveTab] = useState<'upload' | 'explorer' | 'cli'>('upload');

  // GitHub Auth State
  const [token, setToken] = useState(() => localStorage.getItem('gh_token') || '');
  const [showToken, setShowToken] = useState(false);
  const [isVerifyingToken, setIsVerifyingToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [ghUser, setGhUser] = useState<GitHubUser | null>(null);
  const [ghScopes, setGhScopes] = useState<string[]>([]);
  const [ghOrgs, setGhOrgs] = useState<{ login: string; avatar_url: string }[]>([]);

  // Repository Options
  const [uploadMode, setUploadMode] = useState<'create' | 'existing'>('create');
  const [repoName, setRepoName] = useState('my-ai-studio-app');
  const [repoDescription, setRepoDescription] = useState('Exported from Google AI Studio');
  const [isPrivate, setIsPrivate] = useState(false);
  const [targetOwner, setTargetOwner] = useState<string>('');
  const [branch, setBranch] = useState('main');
  const [commitMessage, setCommitMessage] = useState('feat: initial commit from Google AI Studio');

  // Existing repos list
  const [existingRepos, setExistingRepos] = useState<GitHubRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedExistingRepo, setSelectedExistingRepo] = useState<string>('');

  // Project Files
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [selectedFilePaths, setSelectedFilePaths] = useState<Set<string>>(new Set());
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [activePreviewFile, setActivePreviewFile] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Upload Progress
  const [isUploading, setIsUploading] = useState(false);
  const [uploadLogs, setUploadLogs] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccessResult, setUploadSuccessResult] = useState<any | null>(null);

  // UI helpers
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [showTokenGuide, setShowTokenGuide] = useState(false);

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // 1. Fetch project files on mount
  const fetchProjectFiles = async () => {
    setLoadingFiles(true);
    try {
      const res = await fetch('/api/project/files');
      if (res.ok) {
        const data = await fetchJsonWithFallback(res);
        setFiles(data.files || []);
        // By default, select all files
        setSelectedFilePaths(new Set((data.files || []).map((f: ProjectFile) => f.path)));
      } else {
        console.error('Failed to load project files');
      }
    } catch (err) {
      console.error('File scan error:', err);
    } finally {
      setLoadingFiles(false);
    }
  };

  useEffect(() => {
    fetchProjectFiles();
  }, []);

  // Helper safe json parser
  const fetchJsonWithFallback = async (res: Response) => {
    try {
      return await res.json();
    } catch {
      return {};
    }
  };

  // 2. Validate token
  const handleVerifyToken = async (manualToken?: string) => {
    const tokenToTest = (manualToken !== undefined ? manualToken : token).trim();
    if (!tokenToTest) {
      setTokenError('Please enter a GitHub Personal Access Token');
      return;
    }

    setIsVerifyingToken(true);
    setTokenError(null);

    try {
      const res = await fetch('/api/github/validate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenToTest }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'GitHub token validation failed');
      }

      setGhUser(data.user);
      setGhScopes(data.scopes || []);
      setGhOrgs(data.orgs || []);
      setTargetOwner(data.user.login);
      localStorage.setItem('gh_token', tokenToTest);

      // Also trigger loading existing repos in background
      fetchExistingRepos(tokenToTest);
    } catch (err: any) {
      setTokenError(err.message || 'Failed to authenticate with GitHub');
      setGhUser(null);
    } finally {
      setIsVerifyingToken(false);
    }
  };

  // Auto-verify if saved in localStorage
  useEffect(() => {
    const saved = localStorage.getItem('gh_token');
    if (saved) {
      handleVerifyToken(saved);
    }
  }, []);

  // 3. Fetch existing repos
  const fetchExistingRepos = async (authToken: string) => {
    setLoadingRepos(true);
    try {
      const res = await fetch('/api/github/user-repos', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setExistingRepos(data.repos || []);
      }
    } catch (err) {
      console.error('Failed to fetch user repos', err);
    } finally {
      setLoadingRepos(false);
    }
  };

  // Preview file content
  const handlePreviewFile = async (filePath: string) => {
    setActivePreviewFile(filePath);
    setLoadingPreview(true);
    try {
      const res = await fetch(`/api/project/file-content?path=${encodeURIComponent(filePath)}`);
      if (res.ok) {
        const data = await res.json();
        setPreviewContent(data.content || '');
      } else {
        setPreviewContent('// Failed to load file content');
      }
    } catch {
      setPreviewContent('// Error loading file');
    } finally {
      setLoadingPreview(false);
    }
  };

  // Toggle file selection
  const toggleFile = (path: string) => {
    const next = new Set(selectedFilePaths);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setSelectedFilePaths(next);
  };

  const toggleAllFiles = () => {
    if (selectedFilePaths.size === files.length) {
      setSelectedFilePaths(new Set());
    } else {
      setSelectedFilePaths(new Set(files.map((f) => f.path)));
    }
  };

  // Direct Upload trigger
  const handleDirectUpload = async () => {
    if (!token.trim()) {
      setUploadError('Please provide a valid GitHub Personal Access Token first.');
      return;
    }

    const finalRepoName = uploadMode === 'create' ? repoName : selectedExistingRepo;
    if (!finalRepoName) {
      setUploadError('Please specify or select a repository name.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccessResult(null);
    setUploadLogs(['Initiating upload pipeline to GitHub...']);

    try {
      const res = await fetch('/api/github/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token.trim(),
          repoName: finalRepoName,
          repoDescription,
          isPrivate,
          isExisting: uploadMode === 'existing',
          owner: targetOwner || ghUser?.login,
          branch: branch.trim() || 'main',
          commitMessage: commitMessage.trim() || 'Export from Google AI Studio',
          selectedFiles: Array.from(selectedFilePaths),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setUploadLogs(data.steps || []);
        throw new Error(data.error || 'Failed to upload codebase to GitHub.');
      }

      setUploadLogs(data.steps || []);
      setUploadSuccessResult(data.repository);
    } catch (err: any) {
      setUploadError(err.message || 'An unexpected error occurred during upload.');
    } finally {
      setIsUploading(false);
    }
  };

  // Format file size
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const totalSelectedSize = useMemo(() => {
    return files
      .filter((f) => selectedFilePaths.has(f.path))
      .reduce((acc, f) => acc + f.size, 0);
  }, [files, selectedFilePaths]);

  // Terminal commands customized for the user
  const effectiveRepoName = uploadMode === 'create' ? repoName || 'my-ai-app' : selectedExistingRepo || 'my-ai-app';
  const effectiveOwner = targetOwner || ghUser?.login || '<username>';
  const terminalCommands = `# Step 1: Navigate to your project folder
cd my-project

# Step 2: Initialize local git repo and stage code
git init
git add .
git commit -m "${commitMessage || 'feat: initial commit from Google AI Studio'}"

# Step 3: Link remote GitHub repository
git branch -M ${branch || 'main'}
git remote add origin https://github.com/${effectiveOwner}/${effectiveRepoName}.git

# Step 4: Push directly to GitHub
git push -u origin ${branch || 'main'}
`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Github className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-base tracking-tight text-white">GitHub Direct Connect</span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Ready
                </span>
              </div>
              <p className="text-xs text-slate-400">Push project directly to GitHub or download clean archives</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <a
              href="/api/project/download-zip"
              download
              className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4 text-slate-400" />
              <span>Download ZIP</span>
            </a>

            {ghUser ? (
              <div className="flex items-center space-x-2.5 bg-slate-800/80 border border-slate-700/60 rounded-full py-1 pl-1 pr-3">
                <img
                  src={ghUser.avatar_url}
                  alt={ghUser.login}
                  className="w-6 h-6 rounded-full border border-slate-600"
                />
                <span className="text-xs font-medium text-slate-200">@{ghUser.login}</span>
                <button
                  onClick={() => {
                    localStorage.removeItem('gh_token');
                    setGhUser(null);
                    setToken('');
                  }}
                  title="Disconnect account"
                  className="text-slate-400 hover:text-rose-400 transition-colors ml-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowTokenGuide(true)}
                className="inline-flex items-center space-x-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium px-2 py-1 rounded"
              >
                <HelpCircle className="w-4 h-4" />
                <span>How to connect?</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* Answer Banner */}
        <section className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/25 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 w-96 bg-indigo-500/5 blur-3xl pointer-events-none" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div className="space-y-1.5">
              <div className="inline-flex items-center space-x-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
                <Sparkles className="w-4 h-4" />
                <span>Direct GitHub Integration</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Yes! You can connect to GitHub and upload directly.
              </h1>
              <p className="text-sm text-slate-300 max-w-3xl leading-relaxed">
                Connect using your GitHub Personal Access Token below to push this full codebase to a brand-new repository or existing repository with one click.
              </p>
            </div>
            
            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={() => setActiveTab('upload')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'upload'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                Direct Uploader
              </button>
              <button
                onClick={() => setActiveTab('explorer')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'explorer'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                Inspect Files ({files.length})
              </button>
              <button
                onClick={() => setActiveTab('cli')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'cli'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                Git CLI
              </button>
            </div>
          </div>
        </section>

        {/* Tab 1: Direct Uploader */}
        {activeTab === 'upload' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: Configuration (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Step 1: GitHub Authentication */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 font-bold text-xs flex items-center justify-center border border-indigo-500/30">
                      1
                    </div>
                    <h2 className="text-sm font-semibold text-white tracking-wide">
                      Connect GitHub Account
                    </h2>
                  </div>
                  <button
                    onClick={() => setShowTokenGuide(!showTokenGuide)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center space-x-1"
                  >
                    <span>{showTokenGuide ? 'Hide token guide' : 'Get a GitHub token'}</span>
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showTokenGuide ? 'rotate-90' : ''}`} />
                  </button>
                </div>

                {showTokenGuide && (
                  <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 text-xs text-slate-300 space-y-2.5">
                    <p className="font-semibold text-indigo-300">Quick 30-Second Token Guide:</p>
                    <ol className="list-decimal list-inside space-y-1.5 text-slate-400">
                      <li>
                        Go to GitHub:
                        <a
                          href="https://github.com/settings/tokens/new?scopes=repo&description=AI+Studio+Export"
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-400 hover:underline font-semibold ml-1 inline-flex items-center"
                        >
                          Generate New Token (pre-configured)
                          <ExternalLink className="w-3 h-3 ml-1" />
                        </a>
                      </li>
                      <li>Make sure the <code className="bg-slate-800 px-1 py-0.5 rounded text-indigo-300">repo</code> scope checkbox is selected.</li>
                      <li>Scroll down, click <strong className="text-white">Generate token</strong>, and copy your token (starts with <code className="text-slate-200">ghp_...</code>).</li>
                      <li>Paste it into the box below. It is stored only in your local browser session.</li>
                    </ol>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-400 flex items-center justify-between">
                    <span>GitHub Personal Access Token (PAT)</span>
                    {ghUser && (
                      <span className="text-emerald-400 flex items-center space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Connected as @{ghUser.login}</span>
                      </span>
                    )}
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showToken ? 'text' : 'password'}
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-600 font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                      >
                        {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleVerifyToken()}
                      disabled={isVerifyingToken || !token.trim()}
                      className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1.5 transition-colors shrink-0 shadow-sm shadow-indigo-600/30"
                    >
                      {isVerifyingToken ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Verifying...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>{ghUser ? 'Re-verify' : 'Connect'}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {tokenError && (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start space-x-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{tokenError}</span>
                    </div>
                  )}

                  {ghUser && (
                    <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-slate-400">
                      <span className="flex items-center space-x-1">
                        <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                        <span>{ghUser.public_repos + (ghUser.total_private_repos || 0)} Repositories</span>
                      </span>
                      {ghScopes.length > 0 && (
                        <span className="flex items-center space-x-1">
                          <Shield className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Scopes: {ghScopes.join(', ')}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Step 2: Target Repository Details */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center space-x-2.5">
                  <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 font-bold text-xs flex items-center justify-center border border-indigo-500/30">
                    2
                  </div>
                  <h2 className="text-sm font-semibold text-white tracking-wide">
                    Repository Target
                  </h2>
                </div>

                {/* Upload Mode Selector */}
                <div className="grid grid-cols-2 gap-3 p-1 bg-slate-950 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setUploadMode('create')}
                    className={`py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                      uploadMode === 'create'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Create New Repository
                  </button>
                  <button
                    type="button"
                    onClick={() => setUploadMode('existing')}
                    className={`py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                      uploadMode === 'existing'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Push to Existing Repo
                  </button>
                </div>

                {/* Organization / Owner Selector */}
                {ghUser && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Account / Organization</label>
                    <select
                      value={targetOwner}
                      onChange={(e) => setTargetOwner(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                    >
                      <option value={ghUser.login}>{ghUser.login} (Personal Account)</option>
                      {ghOrgs.map((org) => (
                        <option key={org.login} value={org.login}>
                          {org.login} (Organization)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {uploadMode === 'create' ? (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400">New Repository Name</label>
                      <div className="flex items-center">
                        <span className="bg-slate-950 border border-r-0 border-slate-700/80 px-3 py-2 rounded-l-lg text-xs text-slate-400 font-mono">
                          {targetOwner || 'username'}/
                        </span>
                        <input
                          type="text"
                          value={repoName}
                          onChange={(e) => setRepoName(e.target.value)}
                          placeholder="my-ai-studio-app"
                          className="w-full bg-slate-950 border border-slate-700/80 rounded-r-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400">Description (Optional)</label>
                      <input
                        type="text"
                        value={repoDescription}
                        onChange={(e) => setRepoDescription(e.target.value)}
                        placeholder="Built with Google AI Studio"
                        className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    {/* Visibility */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400">Visibility</label>
                      <div className="grid grid-cols-2 gap-3">
                        <label
                          className={`flex items-center space-x-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                            !isPrivate
                              ? 'bg-indigo-950/40 border-indigo-500/50 text-white'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <input
                            type="radio"
                            name="visibility"
                            checked={!isPrivate}
                            onChange={() => setIsPrivate(false)}
                            className="sr-only"
                          />
                          <Globe className="w-4 h-4 text-indigo-400 shrink-0" />
                          <div className="text-xs">
                            <p className="font-semibold text-slate-200">Public</p>
                            <p className="text-[11px] text-slate-400">Anyone on GitHub can see this repo</p>
                          </div>
                        </label>

                        <label
                          className={`flex items-center space-x-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                            isPrivate
                              ? 'bg-indigo-950/40 border-indigo-500/50 text-white'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <input
                            type="radio"
                            name="visibility"
                            checked={isPrivate}
                            onChange={() => setIsPrivate(true)}
                            className="sr-only"
                          />
                          <Lock className="w-4 h-4 text-violet-400 shrink-0" />
                          <div className="text-xs">
                            <p className="font-semibold text-slate-200">Private</p>
                            <p className="text-[11px] text-slate-400">Only you choose who can view</p>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-slate-400">Select Existing Repository</label>
                        {ghUser && (
                          <button
                            type="button"
                            onClick={() => fetchExistingRepos(token)}
                            disabled={loadingRepos}
                            className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
                          >
                            <RefreshCw className={`w-3 h-3 ${loadingRepos ? 'animate-spin' : ''}`} />
                            <span>Refresh list</span>
                          </button>
                        )}
                      </div>

                      {existingRepos.length > 0 ? (
                        <select
                          value={selectedExistingRepo}
                          onChange={(e) => setSelectedExistingRepo(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                        >
                          <option value="">-- Choose a repository ({existingRepos.length} available) --</option>
                          {existingRepos.map((r) => (
                            <option key={r.id} value={r.name}>
                              {r.full_name} {r.private ? '🔒 (Private)' : '🌐 (Public)'}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={selectedExistingRepo}
                          onChange={(e) => setSelectedExistingRepo(e.target.value)}
                          placeholder="e.g. existing-repo-name"
                          className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* Branch & Commit Message */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="space-y-1.5 sm:col-span-1">
                    <label className="text-xs font-medium text-slate-400">Branch</label>
                    <input
                      type="text"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      placeholder="main"
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-medium text-slate-400">Commit Message</label>
                    <input
                      type="text"
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      placeholder="Initial commit from Google AI Studio"
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Step 3: Trigger Upload */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 font-bold text-xs flex items-center justify-center border border-indigo-500/30">
                      3
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-white tracking-wide">
                        Execute Direct Upload
                      </h2>
                      <p className="text-xs text-slate-400">
                        Pushes {selectedFilePaths.size} files ({formatBytes(totalSelectedSize)}) directly to GitHub
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Live Git Sync
                  </span>
                </div>

                {uploadError && (
                  <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-start space-x-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold">Upload Failed</p>
                      <p>{uploadError}</p>
                    </div>
                  </div>
                )}

                {uploadSuccessResult && (
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-emerald-300 flex items-center space-x-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Successfully Uploaded to GitHub!</span>
                      </span>
                      <a
                        href={uploadSuccessResult.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center space-x-1 text-xs font-bold text-emerald-300 underline hover:text-white"
                      >
                        <span>Open on GitHub</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <p className="text-slate-300">
                      Your repository is now live at{' '}
                      <a
                        href={uploadSuccessResult.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-indigo-300 underline"
                      >
                        {uploadSuccessResult.html_url}
                      </a>
                    </p>
                    <div className="bg-slate-950/80 p-2.5 rounded-lg font-mono text-[11px] text-slate-300 flex items-center justify-between">
                      <span>git clone {uploadSuccessResult.html_url}.git</span>
                      <button
                        onClick={() => handleCopy(`git clone ${uploadSuccessResult.html_url}.git`, 'clone-success')}
                        className="text-slate-400 hover:text-white ml-2"
                      >
                        {copiedText === 'clone-success' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleDirectUpload}
                  disabled={isUploading || selectedFilePaths.size === 0}
                  className="w-full py-3.5 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 hover:from-indigo-500 hover:to-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-2 transition-all transform active:scale-[0.99]"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Uploading Directly to GitHub...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>
                        Upload {selectedFilePaths.size} Files Directly to GitHub
                      </span>
                    </>
                  )}
                </button>

                {/* Progress Log Console */}
                {uploadLogs.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-mono flex items-center space-x-1">
                        <Terminal className="w-3 h-3 text-indigo-400" />
                        <span>Execution Pipeline Log</span>
                      </span>
                      {isUploading && (
                        <span className="text-indigo-400 flex items-center space-x-1 animate-pulse">
                          <span>In progress...</span>
                        </span>
                      )}
                    </div>
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-[11px] text-slate-300 max-h-48 overflow-y-auto space-y-1 leading-relaxed">
                      {uploadLogs.map((log, idx) => (
                        <div
                          key={idx}
                          className={`flex items-start space-x-2 ${
                            log.includes('Error')
                              ? 'text-rose-400'
                              : log.includes('Success') || log.includes('All operations finished')
                              ? 'text-emerald-400'
                              : 'text-slate-300'
                          }`}
                        >
                          <span className="text-slate-600 select-none">{idx + 1}.</span>
                          <span>{log}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Files Staged & Summary (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* File Selection Box */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Folder className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-sm font-semibold text-white">Files to Upload</h3>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={toggleAllFiles}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                    >
                      {selectedFilePaths.size === files.length ? 'Deselect all' : 'Select all'}
                    </button>
                    <span className="text-slate-600">•</span>
                    <button
                      onClick={fetchProjectFiles}
                      title="Refresh file scan"
                      className="text-slate-400 hover:text-slate-200"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                <div className="bg-slate-950/90 border border-slate-800/80 rounded-lg p-2.5 max-h-[380px] overflow-y-auto space-y-1 divide-y divide-slate-800/40">
                  {files.map((file) => {
                    const isSelected = selectedFilePaths.has(file.path);
                    return (
                      <div
                        key={file.path}
                        className={`pt-1.5 first:pt-0 flex items-center justify-between px-2 py-1.5 rounded transition-colors ${
                          isSelected ? 'hover:bg-slate-900/80' : 'opacity-50 hover:bg-slate-900/40'
                        }`}
                      >
                        <label className="flex items-center space-x-2.5 text-xs text-slate-300 font-mono cursor-pointer truncate flex-1 mr-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleFile(file.path)}
                            className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                          />
                          {file.path.endsWith('.tsx') || file.path.endsWith('.ts') ? (
                            <FileCode className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          ) : file.path.endsWith('.json') ? (
                            <Code2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          ) : file.path.endsWith('.css') ? (
                            <FileText className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                          ) : (
                            <File className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          )}
                          <span className="truncate">{file.path}</span>
                        </label>
                        <div className="flex items-center space-x-2 shrink-0 text-[11px] text-slate-500">
                          <span>{formatBytes(file.size)}</span>
                          <button
                            type="button"
                            onClick={() => handlePreviewFile(file.path)}
                            className="p-1 text-slate-400 hover:text-indigo-400 transition-colors"
                            title="Preview file"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Selected Payload:</span>
                  <span className="font-semibold text-slate-200">
                    {selectedFilePaths.size} files ({formatBytes(totalSelectedSize)})
                  </span>
                </div>
              </div>

              {/* Fast Tips Card */}
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 text-xs text-slate-400 space-y-2.5">
                <div className="flex items-center space-x-2 text-slate-200 font-semibold">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span>Security &amp; Hygiene Standards</span>
                </div>
                <p className="leading-relaxed">
                  Private secrets such as local <code className="text-slate-300">.env</code>, build artifacts (<code className="text-slate-300">dist/</code>), and <code className="text-slate-300">node_modules/</code> are automatically excluded, keeping your GitHub repository clean and secure.
                </p>
                <div className="pt-1 flex items-center space-x-3">
                  <a
                    href="/api/project/download-zip"
                    download
                    className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center space-x-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download full offline .ZIP</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Project File Explorer */}
        {activeTab === 'explorer' && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Code2 className="w-5 h-5 text-indigo-400" />
                <h2 className="text-sm font-semibold text-white">Project Files ({files.length})</h2>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-xs text-slate-400">Total size: {formatBytes(totalSelectedSize)}</span>
                <a
                  href="/api/project/download-zip"
                  download
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center space-x-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Project ZIP</span>
                </a>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 min-h-[500px]">
              {/* File list */}
              <div className="md:col-span-4 border-r border-slate-800 p-3 space-y-1 overflow-y-auto max-h-[600px] bg-slate-950/40">
                {files.map((file) => (
                  <button
                    key={file.path}
                    onClick={() => handlePreviewFile(file.path)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono flex items-center justify-between transition-colors ${
                      activePreviewFile === file.path
                        ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                        : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate mr-2">
                      <FileCode className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{file.path}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 shrink-0">{formatBytes(file.size)}</span>
                  </button>
                ))}
              </div>

              {/* Code viewer */}
              <div className="md:col-span-8 p-4 flex flex-col bg-slate-950">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
                  <div className="font-mono text-xs text-slate-300 flex items-center space-x-2">
                    <span className="text-slate-500">Viewing:</span>
                    <span className="text-indigo-400 font-semibold">{activePreviewFile || 'Select a file to inspect'}</span>
                  </div>
                  {activePreviewFile && (
                    <button
                      onClick={() => handleCopy(previewContent, 'preview-code')}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 flex items-center space-x-1"
                    >
                      {copiedText === 'preview-code' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>Copy Code</span>
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-auto rounded bg-slate-950/90 font-mono text-xs text-slate-200 p-3 border border-slate-800/60 leading-relaxed">
                  {loadingPreview ? (
                    <div className="flex items-center justify-center h-48 text-slate-500 space-x-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                      <span>Loading file content...</span>
                    </div>
                  ) : activePreviewFile ? (
                    <pre className="whitespace-pre-wrap">{previewContent}</pre>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-48 text-slate-500 space-y-2">
                      <FileText className="w-8 h-8 text-slate-600" />
                      <span>Click any file on the left to preview its full source code.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Git CLI Commands */}
        {activeTab === 'cli' && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white flex items-center space-x-2">
                  <Terminal className="w-5 h-5 text-indigo-400" />
                  <span>Manual Git Terminal Workflow</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Prefer pushing manually from your local terminal? Use these exact commands.
                </p>
              </div>
              <button
                onClick={() => handleCopy(terminalCommands, 'cli-all')}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center space-x-1.5 transition-colors"
              >
                {copiedText === 'cli-all' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Copy All Commands</span>
              </button>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300 relative overflow-x-auto">
              <pre className="whitespace-pre leading-relaxed">{terminalCommands}</pre>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                <span className="text-xs font-bold text-indigo-400">1. Download ZIP</span>
                <p className="text-xs text-slate-400">
                  Click the Download ZIP button to get the clean project archive onto your local workstation.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                <span className="text-xs font-bold text-violet-400">2. Run Local Git</span>
                <p className="text-xs text-slate-400">
                  Unzip into a folder, open your terminal inside it, and paste the commands above.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                <span className="text-xs font-bold text-emerald-400">3. Continuous Deploy</span>
                <p className="text-xs text-slate-400">
                  Connect your new GitHub repository to Vercel, Netlify, or Cloud Run for automated builds!
                </p>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 py-6 mt-12 bg-slate-950 text-center text-xs text-slate-500">
        <p>Google AI Studio • GitHub Direct Connect &amp; Code Uploader</p>
      </footer>
    </div>
  );
}
