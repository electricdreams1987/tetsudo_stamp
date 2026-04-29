export default function ErrorPage() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-destructive">エラーが発生しました</h1>
        <p className="mt-4 text-muted-foreground">処理中に問題が発生しました。もう一度お試しください。</p>
        <div className="mt-8">
          <a href="/login" className="text-primary hover:underline">
            ログイン画面に戻る
          </a>
        </div>
      </div>
    </div>
  )
}
