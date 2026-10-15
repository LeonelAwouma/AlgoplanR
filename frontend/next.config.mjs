/** @type {import('next').NextConfig} */
const nextConfig = {
  // Export HTML/CSS/JS statique (dossier "out") : c'est ce dossier que
  // l'application Electron sert localement, sans serveur Node en production.
  output: 'export',
  images: {
    unoptimized: true,
  },
}

export default nextConfig
