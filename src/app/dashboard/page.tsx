import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getStats } from '@/app/map/actions'
import DashboardClient from '@/components/DashboardClient'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ includePass?: string }>
}) {
  const params = await searchParams
  const includePass = params.includePass !== 'false'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const stats = await getStats(includePass)
  if (!stats) return redirect('/login')

  const { overall, prefStats, regionStats } = stats

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <header className="flex h-14 items-center justify-between border-b px-4 lg:px-6 bg-white sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground font-bold">
            鉄
          </div>
          <h1 className="text-lg font-bold">達成率ダッシュボード</h1>
        </div>
        <nav className="flex items-center gap-4">
          <a href="/map" className="text-sm font-medium hover:underline">全国マップ</a>
          <form action="/auth/signout" method="post">
            <button className="text-sm font-medium hover:underline text-muted-foreground">ログアウト</button>
          </form>
        </nav>
      </header>
      
      <DashboardClient 
        overall={overall} 
        prefStats={prefStats} 
        regionStats={regionStats} 
        includePass={includePass} 
      />
    </div>
  )
}
