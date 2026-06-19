
import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen animate-fade-in bg-slate-100 p-6 dark:bg-slate-950 flex items-center justify-center">
      <div className="max-w-md w-full rounded-lg bg-white p-8 text-center shadow-md transition-colors dark:bg-slate-900 dark:shadow-slate-950/40">
        <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
        <p className="mb-6 text-xl text-slate-700 dark:text-slate-200">Halaman tidak ditemukan</p>
        <p className="mb-8 text-slate-500 dark:text-slate-400">
          Maaf, halaman yang Anda cari tidak ada atau telah dipindahkan.
        </p>
        <Link
          to="/"
          className="bg-primary text-white px-6 py-3 rounded-md hover:bg-primary-hover transition-colors inline-block"
        >
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
