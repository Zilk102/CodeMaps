import * as path from 'path';

export const COMMIT_PREFIX = 'COMMIT:';

export interface ParsedFileChurn {
  filePath: string;
  commits: number;
  additions: number;
  deletions: number;
  lastModified: Date;
  authors: string[];
}

interface CommitHeader {
  hash: string;
  author: string;
  date: Date;
}

const parseCommitHeader = (line: string): CommitHeader => {
  const [hash, author, timestamp] = line.slice(COMMIT_PREFIX.length).split('|');
  const seconds = parseInt(timestamp, 10);
  return { hash, author, date: Number.isNaN(seconds) ? new Date(0) : new Date(seconds * 1000) };
};

/** Accumulates `git log --numstat` output into per-file churn figures. */
export class GitChurnAccumulator {
  private readonly files = new Map<string, ParsedFileChurn>();
  private readonly commitsPerFile = new Map<string, Set<string>>();
  private commit: CommitHeader = { hash: '', author: '', date: new Date() };

  constructor(private readonly projectPath: string) {}

  addLine(line: string): void {
    if (line.startsWith(COMMIT_PREFIX)) {
      this.commit = parseCommitHeader(line);
    } else if (line.trim()) {
      this.addNumstatLine(line);
    }
  }

  result(): ParsedFileChurn[] {
    return Array.from(this.files.values());
  }

  private addNumstatLine(line: string): void {
    const [additions, deletions, filePath] = line.split('\t');
    if (!filePath) return;

    const churn = this.churnFor(path.resolve(this.projectPath, filePath));
    const seenCommits = this.commitsPerFile.get(churn.filePath)!;
    if (!seenCommits.has(this.commit.hash)) {
      seenCommits.add(this.commit.hash);
      churn.commits++;
    }

    churn.additions += parseInt(additions, 10) || 0;
    churn.deletions += parseInt(deletions, 10) || 0;
    if (this.commit.date > churn.lastModified) churn.lastModified = this.commit.date;
    if (this.commit.author && !churn.authors.includes(this.commit.author)) {
      churn.authors.push(this.commit.author);
    }
  }

  private churnFor(absPath: string): ParsedFileChurn {
    let churn = this.files.get(absPath);
    if (!churn) {
      churn = {
        filePath: absPath,
        commits: 0,
        additions: 0,
        deletions: 0,
        lastModified: this.commit.date,
        authors: [],
      };
      this.files.set(absPath, churn);
      this.commitsPerFile.set(absPath, new Set());
    }
    return churn;
  }
}
