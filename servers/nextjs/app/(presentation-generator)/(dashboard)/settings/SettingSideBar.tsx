import React from 'react'
import { LogOut, Palette, Shield } from 'lucide-react'
import { IMAGE_PROVIDERS, LLM_PROVIDERS } from '@/utils/providerConstants'
import { useSelector } from 'react-redux'
import { RootState } from '@/store/store'

type SettingsSection = 'text-provider' | 'image-provider' | 'privacy' | 'session' | 'appearance'

const SettingSideBar = ({ mode, setMode, selectedProvider, setSelectedProvider }: { mode: 'nanobanana' | 'presenton', setMode: (mode: 'nanobanana' | 'presenton') => void, selectedProvider: SettingsSection, setSelectedProvider: (provider: SettingsSection) => void }) => {
    const { llm_config } = useSelector((state: RootState) => state.userConfig)
    const textProviderIcon = LLM_PROVIDERS[llm_config.LLM as keyof typeof LLM_PROVIDERS]?.icon
    const imageProviderIcon = IMAGE_PROVIDERS[llm_config.IMAGE_PROVIDER as keyof typeof IMAGE_PROVIDERS]?.icon || '/providers/pexel.png'
    return (
        <div className='w-full max-w-[230px] h-screen px-3 pt-[22px] bg-[#F9FAFB] flex flex-col'>
            <p className='text-xs text-foreground  font-medium border-b mt-[3.15rem]  border-[#E1E1E5] pb-3.5'>FILTER BY:</p>
            <div className='mt-6 flex-1'>
                <p className='text-[#3A3A3A] text-xs font-medium pb-2.5'>Select Mode</p>
                <div className='p-0.5 rounded-lg bg-[#ffffff] w-fit border border-border flex items-center justify-center mb-[34px] '>
                    <button className={`px-3 font-display h-[26px] text-[10px] font-medium rounded-md ${mode === 'presenton' ? 'bg-primary/5 text-primary' : 'text-[#3A3A3A]'}`}
                        onClick={() => setMode('presenton')}
                    >Template Based
                    </button>
                    <svg xmlns="http://www.w3.org/2000/svg" className='mx-1' width="2" height="17" viewBox="0 0 2 17" fill="none">
                        <path d="M1 0V16.5" stroke="#EDECEC" strokeWidth="2" />
                    </svg>
                    <div className='relative'>
                        <button className='px-3 font-display  h-[26px] text-[10px] font-medium rounded-md cursor-not-allowed opacity-60'
                            disabled
                            style={{
                                background: 'transparent',
                                color: '#9CA3AF'
                            }}
                        >
                            Image Based
                        </button>
                        <span className='absolute -top-2 -right-5 text-[7px] uppercase tracking-wide bg-primary/5 text-primary border border-primary/20 rounded-full px-1.5 py-0.5 whitespace-nowrap'>
                            Coming soon
                        </span>
                    </div>


                </div>
                <p className='text-[#3A3A3A] text-xs font-medium pb-2.5'>Select Provider</p>
                {mode === 'presenton' && <div className='space-y-2.5'>
                    <button className={` w-full rounded-[6px] px-3 py-4 flex items-center gap-1.5 border  ${selectedProvider === 'text-provider' ? 'bg-primary/5 border-primary/20' : 'bg-card border-border'}`} onClick={() => setSelectedProvider('text-provider')}>
                        <div className='relative w-[18px] h-[18px] rounded-full overflow-hidden border border-border'>

                            <img src={textProviderIcon} className=' object-cover w-full h-full overflow-hidden' alt='google' />
                        </div>
                        <p className='text-[#191919] text-xs  font-medium' >Text Provider</p>
                    </button>
                    <button className={` w-full rounded-[6px] px-3 py-4 flex items-center gap-1.5 border  ${selectedProvider === 'image-provider' ? 'bg-primary/5 border-primary/20' : 'bg-card border-border'}`} onClick={() => setSelectedProvider('image-provider')}>
                        <div className='relative w-[18px] h-[18px] rounded-full overflow-hidden border border-border'>
                            <img src={imageProviderIcon} className=' object-cover w-full h-full overflow-hidden' alt='google' />
                        </div>
                        <p className='text-[#191919] text-xs  font-medium' >Image Provider</p>
                    </button>
                </div>}
                {
                    mode === 'nanobanana' && <div>
                        <button className={` w-full rounded-[6px] px-3 py-4 flex items-center gap-1.5 border  bg-primary/5 border-primary/20`}>
                            <div className='relative w-[18px] h-[18px] rounded-full overflow-hidden border border-border'>

                                <img src='/providers/openai.png' className=' object-cover w-full h-full overflow-hidden' alt='google' />
                            </div>
                            <p className='text-[#191919] text-xs  font-medium' >Nanobanana</p>
                        </button>
                    </div>
                }
            </div>

            <div className='border-t border-[#E1E1E5] py-5 relative z-50'>
                <p className='text-[#3A3A3A] text-xs font-medium pb-2.5'>Other</p>
                <div className='space-y-2.5'>
                    <button
                        type="button"
                        className={`w-full rounded-[6px] p-3 py-4 flex items-center gap-1.5 border ${selectedProvider === 'appearance' ? 'bg-primary/5 border-primary/20' : 'bg-card border-border'}`}
                        onClick={() => setSelectedProvider('appearance')}
                    >
                        <div className='relative w-6 h-6 rounded-full overflow-hidden border border-border flex items-center justify-center bg-card'>
                            <Palette className='w-3.5 h-3.5 text-primary' />
                        </div>
                        <p className='text-[#191919] text-xs font-medium'>Appearance</p>
                    </button>
                    <button
                        className={`w-full rounded-[6px] p-3 py-4 flex items-center gap-1.5 border ${selectedProvider === 'privacy' ? 'bg-primary/5 border-primary/20' : 'bg-card border-border'}`}
                        onClick={() => setSelectedProvider('privacy')}
                    >
                        <div className='relative w-6 h-6 rounded-full overflow-hidden border border-border flex items-center justify-center bg-card'>
                            <Shield className='w-3.5 h-3.5 text-primary' />
                        </div>
                        <p className='text-[#191919] text-xs font-medium'>Usage Analytics</p>
                    </button>
                    <button
                        className={`w-full rounded-[6px] p-3 py-4 flex items-center gap-1.5 border ${selectedProvider === 'session' ? 'bg-primary/5 border-primary/20' : 'bg-card border-border'}`}
                        onClick={() => setSelectedProvider('session')}
                    >
                        <div className='relative w-6 h-6 rounded-full overflow-hidden border border-border flex items-center justify-center bg-card'>
                            <LogOut className='w-3.5 h-3.5 text-primary' />
                        </div>
                        <p className='text-[#191919] text-xs font-medium'>Sign out</p>
                    </button>
                </div>
            </div>
        </div>
    )
}

export default SettingSideBar
