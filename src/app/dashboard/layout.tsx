import Navbar from "@/components/Navbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#fdf0e0]">
      <Navbar />
      <main>{children}</main>
    </div>
  );
}
