"use client";
import { Suspense } from "react";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { TeacherOLevelMarksContent } from "@/components/olevel/TeacherOLevelMarksContent";
export default function Page(){return <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl"/>}><TeacherOLevelMarksContent/></Suspense>;}
