"use client";
import { Suspense } from "react";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { OLevelStudentsContent } from "@/components/olevel/OLevelStudentsContent";
export default function Page(){return <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl"/>}><OLevelStudentsContent/></Suspense>;}
