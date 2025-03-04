export interface User {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
}

export interface Repository {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
}

export interface Commit {
  sha: string;
  author: User;
  committer: User;
  commit: {
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
  };
  stats: {
    additions: number;
    deletions: number;
    total: number;
  };
}

export interface Review {
  id: number;
  user: User;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
  submitted_at: string;
  html_url: string;
}

export interface Comment {
  id: number;
  user: User;
  body: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  comment_type?: 'pr_review' | 'pr_line' | 'issue';
  path?: string;
  position?: number;
  original_position?: number;
  commit_id?: string;
  diff_hunk?: string;
  in_reply_to_id?: number;
}

export interface PullRequest {
  id: number;
  number: number;
  title: string;
  user: User;
  state: 'open' | 'closed' | 'merged';
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  draft: boolean;
  html_url: string;
  commits: Commit[];
  reviews: Review[];
  comments: Comment[];
}

export interface RepositoryData {
  repository: Repository;
  pull_requests: PullRequest[];
}

export interface GitHubData {
  organization: string;
  generated_at: string;
  repositories: Record<string, RepositoryData>;
}

export interface FilterState {
  repositories: string[];
  users: string[];
}

export interface StatData {
  user: string;
  value: number;
}

export interface ChartData {
  name: string;
  data: StatData[];
  total: number;
}

export interface DailyUserData {
  [user: string]: number;
}

export interface TimeSeriesData {
  date: string;
  [user: string]: string | number;
  total: number;
} 