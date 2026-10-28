import type { MetadataRoute } from 'next';
import { appName } from '@/lib/config';

// Makes the site open full-screen, like an app, when added to the iPhone home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appName,
    short_name: appName,
    start_url: '/',
    display: 'standalone',
    background_color: '#f2f2f7',
    theme_color: '#f2f2f7',
    icons: [{ src: '/apple-icon', sizes: '180x180', type: 'image/png' }],
  };
}
