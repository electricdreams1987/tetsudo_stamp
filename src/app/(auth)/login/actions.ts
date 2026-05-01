'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

async function getSiteUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (configuredUrl) return configuredUrl.replace(/\/$/, '')

  const headerStore = await headers()
  const origin = headerStore.get('origin')
  if (origin) return origin.replace(/\/$/, '')

  const host = headerStore.get('host')
  const protocol = host?.includes('localhost') ? 'http' : 'https'
  return host ? `${protocol}://${host}` : 'https://tetsudo-stamp.vercel.app'
}

export async function login(formData: FormData) {
  console.log('Login attempt started')
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  
  console.log('Email:', email)

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    console.error('Login error:', error.message)
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  console.log('Login successful')
  revalidatePath('/', 'layout')
  redirect('/map')
}

export async function signup(formData: FormData) {
  console.log('Signup attempt started')
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  console.log('Signup Email:', email)

  const siteUrl = await getSiteUrl()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/confirm`,
    },
  })

  if (error) {
    console.error('Signup error:', error.message)
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  console.log('Signup successful, session:', !!data.session)

  if (!data.session) {
    const message = encodeURIComponent('メールを確認して、アカウントを有効化してください。')
    redirect(`/login?message=${message}`)
  }

  revalidatePath('/', 'layout')
  redirect('/map')
}
