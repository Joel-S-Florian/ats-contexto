"use client";
import { useParams } from "next/navigation";
import { VacancyEditor } from "../vacancy-form";

export default function VacancyPage() {
  const { id } = useParams<{ id: string }>();
  return <VacancyEditor id={id} />;
}
