'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

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

  const { data, error } = await supabase.auth.signUp({ email, password })

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
