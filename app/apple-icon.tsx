import { ImageResponse } from 'next/og';

// Home-screen icon for "Zet op beginscherm" in Safari.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#007aff',
          color: '#ffffff',
          fontSize: 120,
          fontWeight: 700,
        }}
      >
        I
      </div>
    ),
    size,
  );
}
