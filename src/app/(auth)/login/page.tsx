import { login, signup } from './actions'
import { Button } from '@/components/ui/button'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>
}) {
  const params = await searchParams
  const message = params.message
  const error = params.error

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-8 shadow-xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">鉄道スタンプラリー</h1>
          <p className="mt-2 text-sm text-muted-foreground">アカウントにログインまたは新規登録</p>
        </div>

        {message && (
          <div className="mb-4 rounded-md bg-accent/20 p-3 text-center text-sm text-accent font-medium">
            {message}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 p-3 text-center text-sm text-destructive font-medium border border-destructive/20">
            {error}
          </div>
        )}

        <form className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground">
              メールアドレス
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="mail@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground">
              パスワード
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
          
          <div className="mt-4 flex flex-col gap-2">
            <Button type="submit" formAction={login} className="w-full">ログイン</Button>
            <Button type="submit" formAction={signup} variant="outline" className="w-full">新規登録</Button>
          </div>
        </form>

        <div className="mt-6 text-center space-y-4">
          <p className="text-xs text-muted-foreground">
            ※新規登録後、確認メールが届く場合があります。その場合はメール内のリンクをクリックしてからログインしてください。
          </p>
        </div>
      </div>
    </div>
  )
}
