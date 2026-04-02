export type AuthUser = {
  _id: string;
  name: string;
  email: string;
  password: string;
  globalRole: 'admin' | null;
  createdAt: Date;
  isActive: boolean;
  emailVerified: boolean;
  verificationToken: string | null;
  verificationTokenExpires: Date | null;
};

export type UserSession = {
  _id: string;
  name: string;
  email: string;
  globalRole: 'admin' | null;
  isActive: boolean;
};
