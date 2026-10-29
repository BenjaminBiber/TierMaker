export interface User {
  id: number;
  name: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  provider: 'google' | 'password';
}

export interface AuthConfig {
  googleAuth: boolean;
  passwordAuth: boolean;
  allowRegistration: boolean;
}

export interface Person {
  id: number;
  name: string;
  avatarUrl: string | null;
}

export interface BoardSummary {
  id: number;
  title: string;
  description: string;
  status: 'open' | 'closed';
  createdAt: string;
  owner: Person | null;
  itemCount: number;
  voterCount: number;
  myVoteCount: number;
  cover: string | null;
}

export interface Tier {
  id: number;
  name: string;
  color: string;
  position: number;
}

export interface Item {
  id: number;
  name: string;
  description: string;
  image: string | null;
  extra: Record<string, string>;
}

export type ResultsVisibility = 'always' | 'after_vote' | 'after_close';

export interface Board {
  id: number;
  title: string;
  description: string;
  status: 'open' | 'closed';
  resultsVisibility: ResultsVisibility;
  createdAt: string;
  owner: Person | null;
  canManage: boolean;
  canSeeResults: boolean;
  voterCount: number;
  tiers: Tier[];
  items: Item[];
  myVotes: Record<number, number>;
}

export interface ItemResult extends Item {
  votes: number;
  median: number | null;
  mean: number | null;
  stddev: number;
  min: number | null;
  max: number | null;
  distribution: number[];
  position: number | null;
}

export interface Results {
  tiers: (Tier & { items: ItemResult[] })[];
  unrated: ItemResult[];
  ranking: ItemResult[];
  voters: (Person & { voteCount: number })[];
  totalVotes: number;
}

export interface AdminUser extends Person {
  username: string | null;
  email: string | null;
  isAdmin: boolean;
  provider: 'google' | 'password';
  createdAt: string;
  voteCount: number;
  boardCount: number;
}
