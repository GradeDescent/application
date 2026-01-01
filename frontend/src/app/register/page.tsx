'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/apiClient';

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading, user } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      await register(email, password, name || undefined);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Registration failed.');
      }
    }
  };

  useEffect(() => {
    if (user) {
      router.replace('/courses');
    }
  }, [router, user]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(212,180,131,0.25),transparent_55%),radial-gradient(circle_at_bottom,_rgba(66,129,164,0.18),transparent_60%)] p-6">
      <Card className="w-full max-w-md border-none bg-card/95 shadow-xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="GradeDescent" className="h-10 w-10" />
            <div>
              <CardTitle>Create an account</CardTitle>
              <CardDescription>Start using GradeDescent.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            Join your course staff or start a new class space.
          </div>
          <form className="space-y-4" onSubmit={onSubmit}>
            <Input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
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
              Register
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link className="text-foreground underline" href="/login">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
