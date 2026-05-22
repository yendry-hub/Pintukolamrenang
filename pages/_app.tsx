import type { AppProps } from 'next/app'
import '../styles/globals.css'
import { useEffect } from 'react'

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(console.error)
      })
    }
  }, [])

  return <Component {...pageProps} />
}
