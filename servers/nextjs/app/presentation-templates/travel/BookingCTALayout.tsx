import React from 'react'
import * as z from "zod";
import { ImageSchema } from '../defaultSchemes';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-booking-cta'
export const layoutName = 'Booking CTA'
export const layoutDescription = 'A closing call-to-action slide with a stunning destination image on the left and agency details on the right including agency name, tagline, agent contact cards for phone, email, and web, plus a booking button.'

const bookingCTASchema = z.object({
    agency_name: z.string().min(3).max(40).default('Wanderlust Travel Co.').meta({
        description: "Name of the travel agency",
    }),
    tagline: z.string().min(5).max(80).default('Your dream vacation is just one click away. Let us handle the details.').meta({
        description: "Agency tagline or closing statement",
    }),
    agent_name: z.string().min(2).max(40).default('Sarah Mitchell').meta({
        description: "Name of the travel agent or contact person",
    }),
    phone: z.string().min(5).max(20).default('+1 (555) 234-5678').meta({
        description: "Contact phone number",
    }),
    email: z.string().min(5).max(40).default('bookings@wanderlust.com').meta({
        description: "Contact email address",
    }),
    booking_url: z.string().min(5).max(60).default('www.wanderlust-travel.com/book').meta({
        description: "Website URL for online booking",
    }),
    image: ImageSchema.default({
        __image_url__: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1000&q=80',
        __image_prompt__: 'Beautiful tropical beach sunset with clear water',
    }).meta({
        description: "Stunning destination image for the closing slide",
    }),
})

export const Schema = bookingCTASchema

export type BookingCTAData = z.infer<typeof bookingCTASchema>

interface BookingCTALayoutProps {
    data?: Partial<BookingCTAData>
}

const BookingCTALayout: React.FC<BookingCTALayoutProps> = ({ data: slideData }) => {
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

                <div className="relative z-10 flex h-full">
                    <div className="w-1/2 h-full relative">
                        <img
                            src={slideData?.image?.__image_url__ || ''}
                            alt={slideData?.image?.__image_prompt__ || slideData?.agency_name || ''}
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/10" />
                    </div>

                    <div className="w-1/2 flex flex-col justify-center px-12 py-10">
                        <h1
                            className="text-[38px] font-extrabold leading-tight mb-3"
                            style={{ color: 'var(--background-text, #111827)' }}
                        >
                            {slideData?.agency_name || 'Wanderlust Travel Co.'}
                        </h1>

                        <p
                            className="text-[15px] leading-relaxed mb-8 max-w-[400px]"
                            style={{ color: 'var(--background-text, #6b7280)', fontFamily: 'var(--body-font-family, Poppins)' }}
                        >
                            {slideData?.tagline || 'Your dream vacation is just one click away. Let us handle the details.'}
                        </p>

                        <div
                            className="text-[13px] font-semibold mb-4 uppercase tracking-wider"
                            style={{ color: 'var(--primary-color, #2563eb)' }}
                        >
                            Your Travel Agent — {slideData?.agent_name || 'Sarah Mitchell'}
                        </div>

                        <div className="flex flex-col gap-3 mb-8">
                            <div
                                className="flex items-center gap-4 p-4 rounded-lg"
                                style={{ backgroundColor: 'var(--card-color, #f9fafb)' }}
                            >
                                <div
                                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                                    style={{ backgroundColor: 'var(--primary-color, #2563eb)' }}
                                >
                                    <span style={{ color: 'var(--primary-text, #ffffff)' }} className="text-[16px]">📞</span>
                                </div>
                                <div>
                                    <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--background-text, #9ca3af)' }}>Phone</div>
                                    <div className="text-[14px] font-semibold" style={{ color: 'var(--background-text, #111827)', fontFamily: 'var(--body-font-family, Poppins)' }}>
                                        {slideData?.phone || '+1 (555) 234-5678'}
                                    </div>
                                </div>
                            </div>

                            <div
                                className="flex items-center gap-4 p-4 rounded-lg"
                                style={{ backgroundColor: 'var(--card-color, #f9fafb)' }}
                            >
                                <div
                                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                                    style={{ backgroundColor: 'var(--primary-color, #2563eb)' }}
                                >
                                    <span style={{ color: 'var(--primary-text, #ffffff)' }} className="text-[16px]">✉️</span>
                                </div>
                                <div>
                                    <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--background-text, #9ca3af)' }}>Email</div>
                                    <div className="text-[14px] font-semibold" style={{ color: 'var(--background-text, #111827)', fontFamily: 'var(--body-font-family, Poppins)' }}>
                                        {slideData?.email || 'bookings@wanderlust.com'}
                                    </div>
                                </div>
                            </div>

                            <div
                                className="flex items-center gap-4 p-4 rounded-lg"
                                style={{ backgroundColor: 'var(--card-color, #f9fafb)' }}
                            >
                                <div
                                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                                    style={{ backgroundColor: 'var(--primary-color, #2563eb)' }}
                                >
                                    <span style={{ color: 'var(--primary-text, #ffffff)' }} className="text-[16px]">🌐</span>
                                </div>
                                <div>
                                    <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--background-text, #9ca3af)' }}>Website</div>
                                    <div className="text-[14px] font-semibold" style={{ color: 'var(--background-text, #111827)', fontFamily: 'var(--body-font-family, Poppins)' }}>
                                        {slideData?.booking_url || 'www.wanderlust-travel.com/book'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button
                            type="button"
                            className="self-start px-10 py-3.5 rounded-lg text-[16px] font-bold transition-transform hover:scale-105"
                            style={{
                                backgroundColor: 'var(--primary-color, #2563eb)',
                                color: 'var(--primary-text, #ffffff)',
                            }}
                        >
                            Book Your Trip Today
                        </button>
                    </div>
                </div>
            </div>
        </>
    )
}

export default BookingCTALayout
