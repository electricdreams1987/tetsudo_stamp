import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import StationMap from '@/components/StationMap'

export default async function MapPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-14 items-center justify-between border-b px-4 lg:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground font-bold">
            鉄
          </div>
          <h1 className="text-lg font-bold">全国マップ</h1>
        </div>
        <nav className="flex items-center gap-4">
          <a href="/dashboard" className="text-sm font-medium hover:underline">ダッシュボード</a>
          <form action="/auth/signout" method="post">
            <button className="text-sm font-medium hover:underline text-muted-foreground">ログアウト</button>
          </form>
        </nav>
      </header>
      
      <main className="flex-1 relative">
        <StationMap />
      </main>
    </div>
  )
}
