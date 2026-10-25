import { ImageResponse } from "next/og";
export const size = { width: 512, height: 512 };
export const contentType = "image/png";
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#142b42",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontSize: 160,
        fontWeight: 700,
      }}
    >
      <div style={{ display: "flex" }}>
        M<span style={{ color: "#7dd6b8" }}>H</span>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 38,
          color: "#dfb86c",
          letterSpacing: 6,
        }}
      >
        MAAMUL
      </div>
    </div>,
    size,
  );
}
