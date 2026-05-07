'use client';
import { ArrowLeftIcon } from '@radix-ui/react-icons'
import React from 'react'
import { useRouter } from 'next/navigation';

/**
 * BackBtn is currently NOT imported anywhere in the codebase. Kept for
 * potential future use. The button is intentionally styled for
 * white-on-dark contexts (light icon + light translucent border).
 *
 * Phase D cleanup: removed the legacy `bg-white-900` class which was a
 * Tailwind typo (no such utility) and silently no-op'd. The current
 * transparent background matches the prior visual behavior; if a subtle
 * backdrop is needed when the component is reintroduced, swap to
 * `bg-white/10` for translucent or use a theme-aware token.
 */
const BackBtn = () => {
    const router = useRouter();
    return (
        <button onClick={() => router.back()} className='border border-white/20 hover:border-white/60 transition-all duration-200 rounded-lg p-2'>
            <ArrowLeftIcon className="w-5 h-5 text-white" />
        </button>
    )
}

export default BackBtn
