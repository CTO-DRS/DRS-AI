/**
 * Type Definitions for Git Automator
 */

export interface CloneRequest {
  url: string;
  branch?: string;
  depth?: number;
  token?: string;
}

export interface CommitRequest {
  repoDir: string;
  message: string;
  files?: string[];
  author?: string;
}

export interface PushRequest {
  repoDir: string;
  remote?: string;
  branch?: string;
  token?: string;
  setUpstream?: boolean;
}

export interface GitOperationResult {
  success: boolean;
  operationId: string;
  message: string;
  data?: any;
  executionTime: number;
}

export interface RepositoryInfo {
  directory: string;
  currentBranch: string;
  ahead: number;
  behind: number;
  staged: number;
  modified: number;
  untracked: number;
  lastCommit: {
    hash: string;
    message: string;
    author: string;
    date: string;
  } | null;
  remotes: Array<{
    name: string;
    url: string;
  }>;
  branches: string[];
}
