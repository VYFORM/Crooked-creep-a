import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import util from 'util';
import JSZip from 'jszip';

const execPromise = util.promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = process.cwd();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

// Ignored files and folders for project export
const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.cache',
  '.temp',
  'coverage',
  '.parcel-cache',
]);

const IGNORED_FILES = new Set([
  '.DS_Store',
  'Thumbs.db',
  '.env',
  '.env.local',
  '.env.production',
]);

interface ProjectFile {
  path: string;
  size: number;
  isBinary: boolean;
  content?: string;
}

// Helper to check if file is likely binary
function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const binaryExtensions = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svgz',
    '.pdf', '.zip', '.tar', '.gz', '.woff', '.woff2', '.ttf', '.eot',
    '.mp4', '.mp3', '.wav', '.webm',
  ]);
  return binaryExtensions.has(ext);
}

// Recursively scan project files
async function scanFiles(dir: string, baseDir: string = dir): Promise<ProjectFile[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: ProjectFile[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) {
        continue;
      }
      const subFiles = await scanFiles(fullPath, baseDir);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      if (IGNORED_FILES.has(entry.name) || (entry.name.startsWith('.env') && entry.name !== '.env.example')) {
        continue;
      }
      const stat = await fs.stat(fullPath);
      const isBinary = isBinaryFile(fullPath);
      files.push({
        path: relPath,
        size: stat.size,
        isBinary,
      });
    }
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

// 1. Get list of all project files
app.get('/api/project/files', async (req: Request, res: Response) => {
  try {
    const files = await scanFiles(ROOT_DIR);
    res.json({ files, rootDir: ROOT_DIR });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Get content of a specific file
app.get('/api/project/file-content', async (req: Request, res: Response) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath || filePath.includes('..')) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    const fullPath = path.resolve(ROOT_DIR, filePath);
    if (!fullPath.startsWith(ROOT_DIR)) {
      return res.status(403).json({ error: 'Path outside root' });
    }

    if (!fsSync.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const isBinary = isBinaryFile(fullPath);
    if (isBinary) {
      const buffer = await fs.readFile(fullPath);
      return res.json({
        path: filePath,
        isBinary: true,
        content: buffer.toString('base64'),
      });
    }

    const content = await fs.readFile(fullPath, 'utf-8');
    res.json({
      path: filePath,
      isBinary: false,
      content,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Download project as ZIP
app.get('/api/project/download-zip', async (req: Request, res: Response) => {
  try {
    const files = await scanFiles(ROOT_DIR);
    const zip = new JSZip();

    for (const f of files) {
      const fullPath = path.resolve(ROOT_DIR, f.path);
      const content = await fs.readFile(fullPath);
      zip.file(f.path, content);
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    
    // Get project name from package.json if available
    let projectName = 'ai-studio-project';
    try {
      const pkgRaw = await fs.readFile(path.join(ROOT_DIR, 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgRaw);
      if (pkg.name) projectName = pkg.name;
    } catch {}

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${projectName}.zip"`);
    res.send(zipBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Validate GitHub Token & Get User Profile
app.post('/api/github/validate-token', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'GitHub token is required' });
    }

    const ghRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token.trim()}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'AI-Studio-Direct-Uploader',
      },
    });

    if (!ghRes.ok) {
      const errorText = await ghRes.text();
      return res.status(ghRes.status).json({
        error: `GitHub authentication failed (${ghRes.status}): ${errorText}`,
      });
    }

    const user = await ghRes.json();
    const scopesHeader = ghRes.headers.get('x-oauth-scopes') || '';
    const scopes = scopesHeader.split(',').map((s) => s.trim()).filter(Boolean);

    // Also fetch user's organizations
    let orgs: any[] = [];
    try {
      const orgRes = await fetch('https://api.github.com/user/orgs', {
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'AI-Studio-Direct-Uploader',
        },
      });
      if (orgRes.ok) {
        orgs = await orgRes.json();
      }
    } catch {}

    res.json({
      valid: true,
      user: {
        login: user.login,
        name: user.name || user.login,
        avatar_url: user.avatar_url,
        html_url: user.html_url,
        public_repos: user.public_repos,
        total_private_repos: user.total_private_repos || 0,
        email: user.email,
      },
      scopes,
      orgs: orgs.map((o) => ({ login: o.login, avatar_url: o.avatar_url })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. List user repositories
app.get('/api/github/user-repos', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const ghRes = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member', {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'AI-Studio-Direct-Uploader',
      },
    });

    if (!ghRes.ok) {
      const errorText = await ghRes.text();
      return res.status(ghRes.status).json({ error: errorText });
    }

    const repos = await ghRes.json();
    res.json({
      repos: repos.map((r: any) => ({
        id: r.id,
        name: r.name,
        full_name: r.full_name,
        private: r.private,
        default_branch: r.default_branch,
        html_url: r.html_url,
        description: r.description,
        updated_at: r.updated_at,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Direct Upload to GitHub
app.post('/api/github/upload', async (req: Request, res: Response) => {
  const steps: string[] = [];
  const log = (msg: string) => {
    steps.push(msg);
  };

  try {
    const {
      token,
      repoName,
      repoDescription = 'Created with Google AI Studio',
      isPrivate = false,
      isExisting = false,
      owner,
      branch = 'main',
      commitMessage = 'Initial commit from Google AI Studio',
      selectedFiles,
    } = req.body;

    if (!token) return res.status(400).json({ error: 'GitHub token required' });
    if (!repoName) return res.status(400).json({ error: 'Repository name required' });

    const cleanToken = token.trim();
    const cleanRepoName = repoName.trim().replace(/\s+/g, '-');
    const headers = {
      'Authorization': `Bearer ${cleanToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'AI-Studio-Direct-Uploader',
    };

    log('1. Authenticating with GitHub API...');
    const userRes = await fetch('https://api.github.com/user', { headers });
    if (!userRes.ok) {
      throw new Error(`Invalid GitHub token (${userRes.status}): ${await userRes.text()}`);
    }
    const user = await userRes.json();
    const targetOwner = owner || user.login;
    log(`Authenticated as @${user.login}. Target repository: ${targetOwner}/${cleanRepoName}`);

    // Check or create repository
    let repoUrl = '';
    let defaultBranch = branch || 'main';

    log(`2. Checking repository status for ${targetOwner}/${cleanRepoName}...`);
    const checkRepoRes = await fetch(`https://api.github.com/repos/${targetOwner}/${cleanRepoName}`, { headers });

    if (checkRepoRes.ok) {
      const existingRepo = await checkRepoRes.json();
      repoUrl = existingRepo.html_url;
      defaultBranch = existingRepo.default_branch || defaultBranch;
      log(`Found existing repository: ${existingRepo.full_name} (default branch: ${defaultBranch})`);
    } else if (checkRepoRes.status === 404) {
      if (isExisting) {
        throw new Error(`Repository ${targetOwner}/${cleanRepoName} does not exist on GitHub.`);
      }
      log(`Repository does not exist. Creating new repository "${cleanRepoName}"...`);
      
      const createEndpoint = targetOwner === user.login
        ? 'https://api.github.com/user/repos'
        : `https://api.github.com/orgs/${targetOwner}/repos`;

      const createRes = await fetch(createEndpoint, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanRepoName,
          description: repoDescription,
          private: isPrivate,
          auto_init: false,
        }),
      });

      if (!createRes.ok) {
        const createErr = await createRes.text();
        throw new Error(`Failed to create repository: ${createErr}`);
      }

      const newRepo = await createRes.json();
      repoUrl = newRepo.html_url;
      log(`Created repository: ${newRepo.html_url} (${isPrivate ? 'Private' : 'Public'})`);
    } else {
      throw new Error(`GitHub API check error: ${await checkRepoRes.text()}`);
    }

    // Prepare files to push
    log('3. Gathering project files...');
    const allFiles = await scanFiles(ROOT_DIR);
    const filesToUpload = selectedFiles && Array.isArray(selectedFiles) && selectedFiles.length > 0
      ? allFiles.filter((f) => selectedFiles.includes(f.path))
      : allFiles;

    log(`Found ${filesToUpload.length} files to commit.`);

    // Perform Git push using a dedicated isolated temporary directory or direct git commands
    // Using a temp directory prevents modifying the working directory's state while creating a pristine git commit
    const tempDir = path.join('/tmp', `gh-export-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    log(`4. Preparing clean git environment in temporary staging...`);
    await fs.mkdir(tempDir, { recursive: true });

    // Copy selected files into temp directory
    for (const file of filesToUpload) {
      const srcPath = path.join(ROOT_DIR, file.path);
      const destPath = path.join(tempDir, file.path);
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(srcPath, destPath);
    }

    // Ensure .gitignore is present
    const gitignorePath = path.join(tempDir, '.gitignore');
    if (!fsSync.existsSync(gitignorePath)) {
      await fs.writeFile(gitignorePath, 'node_modules/\ndist/\nbuild/\n.env\n.env.local\n*.log\n.DS_Store\n');
    }

    log(`5. Initializing git and committing files...`);
    const execOpts = { cwd: tempDir };

    await execPromise('git init', execOpts);
    await execPromise(`git config user.name "${user.name || user.login}"`, execOpts);
    await execPromise(`git config user.email "${user.email || `${user.login}@users.noreply.github.com`}"`, execOpts);
    await execPromise(`git checkout -b "${branch}"`, execOpts);
    await execPromise('git add .', execOpts);

    const safeCommitMsg = commitMessage.replace(/"/g, '\\"');
    await execPromise(`git commit -m "${safeCommitMsg}"`, execOpts);
    log(`Committed files with message: "${commitMessage}"`);

    log(`6. Direct pushing to https://github.com/${targetOwner}/${cleanRepoName}...`);
    // Authenticated remote URL
    const authenticatedRemote = `https://x-access-token:${cleanToken}@github.com/${targetOwner}/${cleanRepoName}.git`;
    
    // Push with force if needed or standard push
    try {
      await execPromise(`git push -u "${authenticatedRemote}" "${branch}" --force`, execOpts);
      log(`Push completed successfully to branch "${branch}"!`);
    } catch (pushErr: any) {
      // If force failed, try without force or capture specific message
      log(`Note: Force push failed, retrying standard push...`);
      await execPromise(`git push -u "${authenticatedRemote}" "${branch}"`, execOpts);
      log(`Standard push succeeded!`);
    }

    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}

    const repoWebUrl = `https://github.com/${targetOwner}/${cleanRepoName}`;
    log(`7. All operations finished! View your repository at ${repoWebUrl}`);

    res.json({
      success: true,
      repository: {
        name: cleanRepoName,
        owner: targetOwner,
        full_name: `${targetOwner}/${cleanRepoName}`,
        html_url: repoWebUrl,
        branch,
        files_count: filesToUpload.length,
      },
      steps,
    });
  } catch (err: any) {
    log(`Error encountered: ${err.message}`);
    res.status(500).json({
      success: false,
      error: err.message,
      steps,
    });
  }
});

// Setup Vite in Dev or Static files in Production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
