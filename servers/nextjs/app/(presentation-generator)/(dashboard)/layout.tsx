import React from 'react';
import { cookies } from 'next/headers';
import DashboardSidebar from './Components/DashboardSidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';

const Layout = async ({ children }: { children: React.ReactNode }) => {
    /** Read the persisted collapse state from the `sidebar:state` cookie so the
     * sidebar paints in the correct state on first server render — avoids the
     * "expand-then-collapse" flicker on a hard reload when the user previously
     * collapsed the rail. shadcn's standard cookie name is `sidebar:state`. */
    const cookieStore = await cookies();
    const sidebarStateCookie = cookieStore.get('sidebar:state');
    const defaultOpen = sidebarStateCookie?.value !== 'false';

    return (
        <SidebarProvider defaultOpen={defaultOpen}>
            <DashboardSidebar />
            <SidebarInset className="bg-background pr-4">
                <div className="flex items-center gap-2 px-3 pt-3 md:hidden">
                    <SidebarTrigger />
                    <span className="text-sm font-medium text-muted-foreground">Menu</span>
                </div>
                <div className="w-full">
                    {children}
                </div>
            </SidebarInset>
        </SidebarProvider>
    );
};

export default Layout;
