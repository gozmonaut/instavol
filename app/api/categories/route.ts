import { NextResponse } from 'next/server';
import { getCategoriesByUsage } from '@/lib/links';

export async function GET(): Promise<Response> {
  return NextResponse.json({ categories: await getCategoriesByUsage() });
}
