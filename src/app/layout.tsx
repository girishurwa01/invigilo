import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Invigilo - E-Proctor System',
  description: 'Advanced E-Proctor System for secure online examinations',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}