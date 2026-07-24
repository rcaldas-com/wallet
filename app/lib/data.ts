import { ObjectId } from 'mongodb';
import clientPromise from './mongodb';
import { AuthUser, UserRole } from './definitions';

const VALID_ROLES = new Set<UserRole>(['admin', 'wallet', 'digitar']);

// Mesma normalização do app web — mantém os papéis consistentes entre os apps.
function normalizeRoles(user: Record<string, unknown>): UserRole[] {
  const email = typeof user.email === 'string' ? user.email : '';
  const globalRole = typeof user.globalRole === 'string' ? user.globalRole : null;
  const roles = Array.isArray(user.roles)
    ? user.roles.filter(
        (role): role is UserRole => typeof role === 'string' && VALID_ROLES.has(role as UserRole),
      )
    : [];

  if ((globalRole === 'admin' || email.toLowerCase() === 'rclgsm@gmail.com') && !roles.includes('admin')) {
    roles.push('admin');
  }

  return roles;
}

// Autenticação (login, cadastro, verificação de email) é responsabilidade do
// app principal. Aqui só resolvemos o usuário da sessão compartilhada.
export async function getUserById(userId: string): Promise<AuthUser | null> {
  try {
    const client = await clientPromise;
    const db = client.db();
    const user = await db.collection('user').findOne(
      { _id: new ObjectId(userId) },
      { projection: { password: 0 } }
    );

    if (!user) return null;

    return {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      password: '',
      globalRole: user.globalRole || null,
      roles: normalizeRoles(user),
      createdAt: user.createdAt,
      isActive: user.isActive ?? true,
      emailVerified: user.emailVerified ?? false,
      verificationToken: user.verificationToken || null,
      verificationTokenExpires: user.verificationTokenExpires || null,
      theme: user.theme === 'dark' || user.theme === 'light' ? user.theme : undefined,
    };
  } catch (error) {
    console.error('Database Error:', error);
    return null;
  }
}
