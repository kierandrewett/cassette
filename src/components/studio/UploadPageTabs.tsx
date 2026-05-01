"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type UploadPageTabsProps = {
    singleForm: React.ReactNode;
    bulkForm: React.ReactNode;
};

export const UploadPageTabs = ({ singleForm, bulkForm }: UploadPageTabsProps) => {
    return (
        <Tabs defaultValue="single">
            <TabsList className="mb-6">
                <TabsTrigger value="single">Single</TabsTrigger>
                <TabsTrigger value="bulk">Bulk</TabsTrigger>
            </TabsList>

            <TabsContent value="single">{singleForm}</TabsContent>
            <TabsContent value="bulk">{bulkForm}</TabsContent>
        </Tabs>
    );
};
