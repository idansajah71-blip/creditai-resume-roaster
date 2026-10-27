import { describe, it, expect } from "vitest";
import { detectLanguage, languageName } from "@/lib/language";

describe("language detection heuristic", () => {
  it("detects English resumes", () => {
    const text = `John Smith
Backend Engineer with 5 years of experience working on the payments team.
Managed the migration project for our company client using Node.js and PostgreSQL.`;
    expect(detectLanguage(text)).toBe("en");
  });

  it("detects Indonesian resumes", () => {
    const text = `Budi Santoso
Mobile Developer

Pengalaman: Mobile Developer di Toko Amanah selama 3 tahun.
Saya mengembangkan aplikasi Android untuk 50.000 pengguna dan bertanggung jawab
atas kualitas kode bersama anggota tim lain.
Kami melakukan pengujian pada setiap rilis perusahaan.`;
    expect(detectLanguage(text)).toBe("id");
  });

  it("defaults to English for mixed or sparse text", () => {
    expect(detectLanguage("Kubernetes PostgreSQL Docker")).toBe("en");
    expect(detectLanguage("")).toBe("en");
  });

  it("labels languages for the UI badge", () => {
    expect(languageName("id")).toBe("Indonesian");
    expect(languageName("en")).toBe("English");
  });
});
