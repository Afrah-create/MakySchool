"use client";
import { Suspense } from "react";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { TeacherOLevelOverview } from "@/components/olevel/TeacherOLevelOverview";
export default function Page(){return <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl"/>}><TeacherOLevelOverview/></Suspense>;}
