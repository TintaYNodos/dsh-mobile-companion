/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.util.AttributeSet;
import android.util.TypedValue;
import android.view.View;

import java.util.ArrayList;
import java.util.List;

/**
 * Gráfica nativa compacta de telemetría de grado industrial (54dp) estilo Linear / Activity Monitor.
 * Dibuja curvas suaves Bézier con antialiasing para CPU (con relleno gradiente al 12%)
 * y Temperatura, con encabezado monoespaciado y chip de estado de batería.
 */
public class TelemetryChartView extends View {

    private final List<MainActivity.TelemetryPoint> points = new ArrayList<>();
    private int batteryLevel = -1;
    private boolean batteryAc = false;

    private final Paint bgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint borderPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint headerTextPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint chipBgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint chipBorderPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint chipTextPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint cpuStrokePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint cpuFillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint cpuDotPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint tempStrokePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint tempDotPaint = new Paint(Paint.ANTI_ALIAS_FLAG);

    private final RectF bounds = new RectF();
    private final RectF chipBounds = new RectF();
    private final Path cpuPath = new Path();
    private final Path cpuFillPath = new Path();
    private final Path tempPath = new Path();

    public TelemetryChartView(Context context) {
        super(context);
        init();
    }

    public TelemetryChartView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    public TelemetryChartView(Context context, AttributeSet attrs, int defStyleAttr) {
        super(context, attrs, defStyleAttr);
        init();
    }

    private void init() {
        bgPaint.setColor(Color.parseColor("#0D1117"));
        bgPaint.setStyle(Paint.Style.FILL);
        bgPaint.setAntiAlias(true);

        borderPaint.setColor(Color.parseColor("#30363D"));
        borderPaint.setStyle(Paint.Style.STROKE);
        borderPaint.setStrokeWidth(dp(1f));
        borderPaint.setAntiAlias(true);

        headerTextPaint.setColor(Color.parseColor("#C9D1D9"));
        headerTextPaint.setTextSize(sp(9.5f));
        headerTextPaint.setTypeface(Typeface.MONOSPACE);
        headerTextPaint.setAntiAlias(true);

        chipBgPaint.setColor(Color.parseColor("#161B22"));
        chipBgPaint.setStyle(Paint.Style.FILL);
        chipBgPaint.setAntiAlias(true);

        chipBorderPaint.setColor(Color.parseColor("#30363D"));
        chipBorderPaint.setStyle(Paint.Style.STROKE);
        chipBorderPaint.setStrokeWidth(dp(0.8f));
        chipBorderPaint.setAntiAlias(true);

        chipTextPaint.setColor(Color.parseColor("#8B949E"));
        chipTextPaint.setTextSize(sp(8.5f));
        chipTextPaint.setTypeface(Typeface.MONOSPACE);
        chipTextPaint.setAntiAlias(true);

        cpuStrokePaint.setColor(Color.parseColor("#58A6FF"));
        cpuStrokePaint.setStyle(Paint.Style.STROKE);
        cpuStrokePaint.setStrokeWidth(dp(1.8f));
        cpuStrokePaint.setStrokeJoin(Paint.Join.ROUND);
        cpuStrokePaint.setStrokeCap(Paint.Cap.ROUND);
        cpuStrokePaint.setAntiAlias(true);

        cpuFillPaint.setStyle(Paint.Style.FILL);
        cpuFillPaint.setAntiAlias(true);

        cpuDotPaint.setColor(Color.parseColor("#58A6FF"));
        cpuDotPaint.setStyle(Paint.Style.FILL);
        cpuDotPaint.setAntiAlias(true);

        tempStrokePaint.setColor(Color.parseColor("#F87171"));
        tempStrokePaint.setStyle(Paint.Style.STROKE);
        tempStrokePaint.setStrokeWidth(dp(1.4f));
        tempStrokePaint.setStrokeJoin(Paint.Join.ROUND);
        tempStrokePaint.setStrokeCap(Paint.Cap.ROUND);
        tempStrokePaint.setAntiAlias(true);

        tempDotPaint.setColor(Color.parseColor("#F87171"));
        tempDotPaint.setStyle(Paint.Style.FILL);
        tempDotPaint.setAntiAlias(true);
    }

    public void setBatteryInfo(int level, boolean isAc) {
        this.batteryLevel = level;
        this.batteryAc = isAc;
        invalidate();
    }

    public void setData(List<MainActivity.TelemetryPoint> newPoints) {
        points.clear();
        if (newPoints != null) {
            points.addAll(newPoints);
        }
        invalidate();
    }

    @Override
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        int defaultHeight = (int) dp(54f);
        int hMode = MeasureSpec.getMode(heightMeasureSpec);
        int hSize = MeasureSpec.getSize(heightMeasureSpec);
        int finalH;
        if (hMode == MeasureSpec.EXACTLY) {
            finalH = hSize;
        } else if (hMode == MeasureSpec.AT_MOST) {
            finalH = Math.min(defaultHeight, hSize);
        } else {
            finalH = defaultHeight;
        }
        setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), finalH);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);

        int w = getWidth();
        int h = getHeight();
        if (w <= 0 || h <= 0) return;

        bounds.set(0, 0, w, h);
        float radius = dp(6f);
        canvas.drawRoundRect(bounds, radius, radius, bgPaint);
        canvas.drawRoundRect(bounds, radius, radius, borderPaint);

        // 1. Encabezado monoespaciado superior compacto: CPU 4% · 40°C · RAM 58%
        String headerText;
        if (points.isEmpty()) {
            headerText = "CPU --% · --°C · RAM --%";
        } else {
            MainActivity.TelemetryPoint latest = points.get(points.size() - 1);
            StringBuilder sb = new StringBuilder();
            sb.append("CPU ").append(latest.cpuPercent).append("%");
            if (latest.tempC > 0) {
                sb.append(" · ").append(latest.tempC).append("°C");
            }
            if (latest.ramPercent > 0) {
                sb.append(" · RAM ").append(latest.ramPercent).append("%");
            }
            headerText = sb.toString();
        }
        canvas.drawText(headerText, dp(8f), dp(11.5f), headerTextPaint);

        // 2. Chip de batería sutil (BAT 85% (AC))
        if (batteryLevel >= 0) {
            String batText = "BAT " + batteryLevel + "%" + (batteryAc ? " (AC)" : "");
            float batTextW = chipTextPaint.measureText(batText);
            float chipH = dp(12f);
            float chipW = batTextW + dp(8f);
            float chipRight = w - dp(8f);
            float chipLeft = chipRight - chipW;
            float chipTop = dp(2f);
            float chipBottom = chipTop + chipH;

            chipBounds.set(chipLeft, chipTop, chipRight, chipBottom);
            canvas.drawRoundRect(chipBounds, dp(3f), dp(3f), chipBgPaint);
            canvas.drawRoundRect(chipBounds, dp(3f), dp(3f), chipBorderPaint);

            chipTextPaint.setColor(batteryAc ? Color.parseColor("#7EE787") : Color.parseColor("#8B949E"));
            canvas.drawText(batText, chipLeft + dp(4f), chipTop + dp(9f), chipTextPaint);
        }

        // 3. Área de trazado de curvas suaves
        float padLeft = dp(8f);
        float padRight = dp(8f);
        float padTop = dp(16f);
        float padBottom = dp(4f);

        float plotW = w - padLeft - padRight;
        float plotH = h - padTop - padBottom;
        if (plotW <= 0 || plotH <= 0) return;

        int count = points.size();
        if (count == 0) return;

        // Auto-escala dinámica adaptativa para que no se vea plano cuando el servidor está en reposo
        float minCpu = 100f, maxCpu = 0f;
        float minTemp = 100f, maxTemp = 0f;
        for (MainActivity.TelemetryPoint pt : points) {
            if (pt.cpuPercent < minCpu) minCpu = pt.cpuPercent;
            if (pt.cpuPercent > maxCpu) maxCpu = pt.cpuPercent;
            if (pt.tempC > 0) {
                if (pt.tempC < minTemp) minTemp = pt.tempC;
                if (pt.tempC > maxTemp) maxTemp = pt.tempC;
            }
        }
        float rangeCpu = Math.max(16f, (maxCpu - minCpu) + 8f);
        float baseCpu = Math.max(0f, minCpu - 4f);

        float rangeTemp = Math.max(12f, (maxTemp - minTemp) + 6f);
        float baseTemp = Math.max(20f, minTemp - 3f);

        // Curva suave de CPU (con relleno gradiente al 12% semitransparente)
        cpuPath.reset();
        cpuFillPath.reset();

        if (count == 1) {
            MainActivity.TelemetryPoint pt = points.get(0);
            float x = padLeft + (plotW / 2f);
            float valCpu = Math.max(0, Math.min(100, pt.cpuPercent));
            float y = padTop + plotH - ((valCpu - baseCpu) / rangeCpu * plotH);
            canvas.drawCircle(x, y, dp(2.2f), cpuDotPaint);
        } else {
            for (int i = 0; i < count; i++) {
                MainActivity.TelemetryPoint pt = points.get(i);
                float x = padLeft + (i * plotW / (count - 1));
                float valCpu = Math.max(0, Math.min(100, pt.cpuPercent));
                float y = padTop + plotH - ((valCpu - baseCpu) / rangeCpu * plotH);

                if (i == 0) {
                    cpuPath.moveTo(x, y);
                    cpuFillPath.moveTo(x, padTop + plotH);
                    cpuFillPath.lineTo(x, y);
                } else {
                    MainActivity.TelemetryPoint prevPt = points.get(i - 1);
                    float prevX = padLeft + ((i - 1) * plotW / (count - 1));
                    float prevValCpu = Math.max(0, Math.min(100, prevPt.cpuPercent));
                    float prevY = padTop + plotH - ((prevValCpu - baseCpu) / rangeCpu * plotH);

                    float cx = (prevX + x) / 2f;
                    cpuPath.cubicTo(cx, prevY, cx, y, x, y);
                    cpuFillPath.cubicTo(cx, prevY, cx, y, x, y);
                }
            }

            float lastX = padLeft + plotW;
            cpuFillPath.lineTo(lastX, padTop + plotH);
            cpuFillPath.close();

            LinearGradient cpuGradient = new LinearGradient(
                    0, padTop, 0, padTop + plotH,
                    Color.argb(31, 88, 166, 255), // 12% semitransparente
                    Color.argb(0, 88, 166, 255),
                    Shader.TileMode.CLAMP);
            cpuFillPaint.setShader(cpuGradient);

            canvas.drawPath(cpuFillPath, cpuFillPaint);
            canvas.drawPath(cpuPath, cpuStrokePaint);

            // Punto actual en extremo derecho
            MainActivity.TelemetryPoint lastPt = points.get(count - 1);
            float valCpu = Math.max(0, Math.min(100, lastPt.cpuPercent));
            float lastY = padTop + plotH - ((valCpu - baseCpu) / rangeCpu * plotH);
            canvas.drawCircle(lastX, lastY, dp(2.2f), cpuDotPaint);
        }

        // Curva suave de Temperatura (#F87171)
        boolean hasTemp = false;
        for (MainActivity.TelemetryPoint pt : points) {
            if (pt.tempC > 0) {
                hasTemp = true;
                break;
            }
        }

        if (hasTemp) {
            tempPath.reset();
            boolean started = false;
            float prevX = 0, prevY = 0;
            float lastTempX = 0, lastTempY = 0;

            for (int i = 0; i < count; i++) {
                MainActivity.TelemetryPoint pt = points.get(i);
                if (pt.tempC <= 0) continue;
                float x = count > 1 ? padLeft + (i * plotW / (count - 1)) : padLeft + (plotW / 2f);
                float valTemp = Math.max(0, Math.min(100, pt.tempC));
                float y = padTop + plotH - ((valTemp - baseTemp) / rangeTemp * plotH);

                if (!started) {
                    tempPath.moveTo(x, y);
                    started = true;
                } else {
                    float cx = (prevX + x) / 2f;
                    tempPath.cubicTo(cx, prevY, cx, y, x, y);
                }
                prevX = x;
                prevY = y;
                lastTempX = x;
                lastTempY = y;
            }

            if (started) {
                canvas.drawPath(tempPath, tempStrokePaint);
                canvas.drawCircle(lastTempX, lastTempY, dp(1.8f), tempDotPaint);
            }
        }
    }

    private float dp(float value) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics());
    }

    private float sp(float value) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, value, getResources().getDisplayMetrics());
    }
}
