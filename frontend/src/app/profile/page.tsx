'use client';

import { AuthGuard } from '@/components/auth-guard';
import { PageShell } from '@/components/page-shell';
import { SiteHeader } from '@/components/site-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth';
import { gravatarUrl } from '@/lib/gravatar';

export default function ProfilePage() {
  const { user } = useAuth();

  return (
    <AuthGuard>
      <PageShell className="bg-[linear-gradient(130deg,_rgba(66,129,164,0.12),transparent_45%),linear-gradient(230deg,_rgba(193,102,107,0.12),transparent_45%)]">
        <SiteHeader
          title="Profile"
          subtitle="Account details"
          breadcrumbs={[{ label: 'Profile' }]}
        />
        <main className="mx-auto max-w-3xl flex-1 px-6 py-10">
          <Card className="border-none bg-card/90 shadow">
            <CardHeader>
              <CardTitle>Your profile</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center">
              {user ? (
                <>
                  <img
                    src={gravatarUrl(user.email, 128)}
                    alt={user.name || user.email}
                    className="h-20 w-20 rounded-full border border-border"
                  />
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</p>
                      <p className="text-base font-semibold">{user.name || 'Not set'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Unable to load profile.</p>
              )}
            </CardContent>
          </Card>
        </main>
      </PageShell>
    </AuthGuard>
  );
}
