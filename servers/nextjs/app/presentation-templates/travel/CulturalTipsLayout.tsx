import React from 'react'
import * as z from "zod";
import { IconSchema } from '../defaultSchemes';
import { RemoteSvgIcon } from '@/app/hooks/useRemoteSvgIcon';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-cultural-tips'
export const layoutName = 'Cultural Tips'
export const layoutDescription = 'A slide presenting local customs and travel tips with icon-enhanced tip cards on the left and do/don\'t lists with green checkmarks and red X marks on the right.'

const culturalTipsSchema = z.object({
    title: z.string().min(3).max(50).default('Cultural Tips & Etiquette').meta({
        description: "Main heading for the cultural tips slide",
    }),
    description: z.string().min(10).max(120).default('Essential customs and etiquette to help you navigate local traditions with confidence and respect.').meta({
        description: "Brief intro describing the purpose of the tips",
    }),
    tips: z.array(z.object({
        title: z.string().min(3).max(30).meta({
            description: "Short title for the cultural tip",
        }),
        description: z.string().min(10).max(80).meta({
            description: "Brief explanation of the cultural tip",
        }),
        icon: IconSchema.meta({
            description: "Icon representing the tip category",
        }),
        dos: z.array(z.string().min(3).max(60).meta({
            description: "A recommended behavior or action",
        })).min(2).max(4).meta({
            description: "List of recommended actions for this tip",
        }),
        donts: z.array(z.string().min(3).max(60).meta({
            description: "A behavior or action to avoid",
        })).min(2).max(4).meta({
            description: "List of actions to avoid for this tip",
        }),
    })).min(3).max(6).default([
        {
            title: 'Greetings',
            description: 'How to properly greet locals and show respect in social settings.',
            icon: {
                __icon_url__: 'https://presenton-public.s3.ap-southeast-1.amazonaws.com/static/icons/bold/checks-bold.svg',
                __icon_query__: 'handshake greeting',
            },
            dos: ['Bow slightly when greeting elders', 'Use both hands when giving or receiving items'],
            donts: ['Avoid firm handshakes unless initiated', 'Don\'t touch someone\'s head'],
        },
        {
            title: 'Dining Etiquette',
            description: 'Navigate meals gracefully with these essential table manners.',
            icon: {
                __icon_url__: 'https://presenton-public.s3.ap-southeast-1.amazonaws.com/static/icons/bold/fediverse-logo-bold.svg',
                __icon_query__: 'utensils dining food',
            },
            dos: ['Wait for the host to begin eating', 'Try a small portion of every dish offered'],
            donts: ['Don\'t leave chopsticks upright in rice', 'Avoid pointing with utensils'],
        },
        {
            title: 'Temple Visits',
            description: 'Respectful practices when visiting sacred and religious sites.',
            icon: {
                __icon_url__: 'https://presenton-public.s3.ap-southeast-1.amazonaws.com/static/icons/bold/checks-bold.svg',
                __icon_query__: 'temple building sacred',
            },
            dos: ['Remove shoes before entering', 'Dress modestly covering shoulders and knees'],
            donts: ['Don\'t photograph worshippers without permission', 'Avoid turning your back to statues'],
        },
    ]).meta({
        description: "List of cultural tips with dos and donts",
    }),
})

export const Schema = culturalTipsSchema

export type CulturalTipsData = z.infer<typeof culturalTipsSchema>

interface CulturalTipsLayoutProps {
    data?: Partial<CulturalTipsData>
}

const CulturalTipsLayout: React.FC<CulturalTipsLayoutProps> = ({ data: slideData }) => {
    const tips = slideData?.tips || []
    const activeTip = tips[0]

    return (
        <>
            <TravelFonts />

            <div
                className="w-full rounded-sm max-w-[1280px] shadow-lg max-h-[720px] aspect-video relative z-20 mx-auto overflow-hidden"
                style={{
                    background: "var(--background-color,#ffffff)",
                    fontFamily: "var(--heading-font-family,Poppins)",
                }}
            >
                {((slideData as any)?.__companyName__ || (slideData as any)?._logo_url__) && (
                    <div className="absolute top-0 left-0 right-0 px-8 sm:px-12 lg:px-20 pt-4 z-30">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1">
                                {(slideData as any)?._logo_url__ && <img src={(slideData as any)?._logo_url__} alt="logo" className="w-6 h-6" />}
                                {(slideData as any)?.__companyName__ && <span className="text-sm sm:text-base font-semibold" style={{ color: 'var(--background-text, #111827)' }}>
                                    {(slideData as any)?.__companyName__ || 'Company Name'}
                                </span>}
                            </div>
                        </div>
                    </div>
                )}

                <div className="relative z-10 flex flex-col h-full px-8 sm:px-12 lg:px-20 pt-14 pb-8">
                    <div className="mb-6">
                        <h1
                            className="text-[36px] font-bold leading-tight mb-2"
                            style={{ color: 'var(--background-text, #111827)' }}
                        >
                            {slideData?.title || 'Cultural Tips & Etiquette'}
                        </h1>
                        <p
                            className="text-[15px] leading-relaxed max-w-[600px]"
                            style={{ color: 'var(--background-text, #6b7280)', fontFamily: 'var(--body-font-family, Poppins)' }}
                        >
                            {slideData?.description || 'Essential customs and etiquette to help you navigate local traditions with confidence and respect.'}
                        </p>
                    </div>

                    <div className="flex flex-1 gap-8 min-h-0">
                        <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                            {tips.map((tip, index) => (
                                <div
                                    key={index}
                                    className="flex items-start gap-4 p-4 rounded-lg"
                                    style={{ backgroundColor: 'var(--card-color, #f9fafb)' }}
                                >
                                    <div
                                        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                                        style={{ backgroundColor: 'var(--primary-color, #2563eb)' }}
                                    >
                                        {tip.icon?.__icon_url__ && (
                                            <RemoteSvgIcon
                                                url={tip.icon.__icon_url__}
                                                strokeColor="currentColor"
                                                className="w-5 h-5"
                                                color="var(--primary-text, #ffffff)"
                                                title={tip.icon?.__icon_query__ || ''}
                                            />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3
                                            className="text-[15px] font-semibold mb-1"
                                            style={{ color: 'var(--background-text, #111827)' }}
                                        >
                                            {tip.title}
                                        </h3>
                                        <p
                                            className="text-[12px] leading-relaxed"
                                            style={{ color: 'var(--background-text, #6b7280)', fontFamily: 'var(--body-font-family, Poppins)' }}
                                        >
                                            {tip.description}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                            {activeTip && (
                                <>
                                    <div>
                                        <h3
                                            className="text-[16px] font-semibold mb-3 flex items-center gap-2"
                                            style={{ color: 'var(--background-text, #111827)' }}
                                        >
                                            <span className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xs">✓</span>
                                            Do&apos;s
                                        </h3>
                                        <div className="flex flex-col gap-2">
                                            {activeTip.dos?.map((item, i) => (
                                                <div
                                                    key={i}
                                                    className="flex items-start gap-3 p-3 rounded-md"
                                                    style={{ backgroundColor: 'var(--card-color, #f0fdf4)' }}
                                                >
                                                    <span className="text-green-500 font-bold text-sm mt-0.5 flex-shrink-0">✓</span>
                                                    <span
                                                        className="text-[13px] leading-snug"
                                                        style={{ color: 'var(--background-text, #374151)', fontFamily: 'var(--body-font-family, Poppins)' }}
                                                    >
                                                        {item}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <h3
                                            className="text-[16px] font-semibold mb-3 flex items-center gap-2"
                                            style={{ color: 'var(--background-text, #111827)' }}
                                        >
                                            <span className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xs">✕</span>
                                            Don&apos;ts
                                        </h3>
                                        <div className="flex flex-col gap-2">
                                            {activeTip.donts?.map((item, i) => (
                                                <div
                                                    key={i}
                                                    className="flex items-start gap-3 p-3 rounded-md"
                                                    style={{ backgroundColor: 'var(--card-color, #fef2f2)' }}
                                                >
                                                    <span className="text-red-500 font-bold text-sm mt-0.5 flex-shrink-0">✕</span>
                                                    <span
                                                        className="text-[13px] leading-snug"
                                                        style={{ color: 'var(--background-text, #374151)', fontFamily: 'var(--body-font-family, Poppins)' }}
                                                    >
                                                        {item}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default CulturalTipsLayout
