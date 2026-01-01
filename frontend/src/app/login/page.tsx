'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/apiClient';
import { PageShell } from '@/components/page-shell';

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Login failed.');
      }
    }
  };

  useEffect(() => {
    if (user) {
      router.replace('/courses');
    }
  }, [router, user]);

  return (
    <PageShell className="bg-[radial-gradient(circle_at_top,_rgba(66,129,164,0.25),transparent_55%),radial-gradient(circle_at_bottom,_rgba(72,169,166,0.18),transparent_60%)]">
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-md border-none bg-card/95 shadow-xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <img src="/icon.svg" alt="GradeDescent" className="h-10 w-10" />
            <div>
              <CardTitle>Welcome back</CardTitle>
              <CardDescription>Sign in to your GradeDescent account.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            Use your existing account or create a new one in seconds.
          </div>
          <form className="space-y-4" onSubmit={onSubmit}>
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" type="submit" disabled={isLoading}>
              Sign in
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            No account yet?{' '}
            <Link className="text-foreground underline" href="/register">
              Register
            </Link>
          </p>
        </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
