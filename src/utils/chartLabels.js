/**
 * Creates a Chart.js plugin for drawing labels on the right side of the chart
 * with smart positioning to avoid overlaps and callout lines when needed.
 */
export function createLabelPlugin(labelBoundsRef) {
  return {
    afterDatasetsDraw: (chart) => {
      const ctx = chart.ctx;

      // First pass: collect all label positions (only for datasets we want to label)
      const labels = [];
      chart.data.datasets.forEach((dataset, i) => {
        // Skip if this dataset shouldn't have a label (e.g., range bars)
        if (dataset.skipLabel) return;

        const meta = chart.getDatasetMeta(i);
        if (!meta.hidden && meta.data.length > 0) {
          const lastPoint = meta.data[meta.data.length - 1];
          ctx.font = 'bold 12px sans-serif';
          const textWidth = ctx.measureText(dataset.label).width;

          labels.push({
            text: dataset.label,
            color: dataset.borderColor,
            dataPointX: lastPoint.x,
            dataPointY: lastPoint.y,
            x: lastPoint.x + 20,
            y: lastPoint.y,
            width: textWidth,
            height: 16
          });
        }
      });

      // Sort by y position to process from top to bottom
      labels.sort((a, b) => a.y - b.y);

      // Adjust positions to avoid overlaps and track original positions
      const minSpacing = 18;
      labels.forEach(label => {
        label.originalY = label.y;
      });

      for (let i = 1; i < labels.length; i++) {
        const current = labels[i];
        const previous = labels[i - 1];

        if (current.y - previous.y < minSpacing) {
          current.y = previous.y + minSpacing;
        }
      }

      // Clear previous label bounds
      labelBoundsRef.current = [];

      // Draw callout lines and labels
      labels.forEach(label => {
        // Draw callout line if label was moved
        if (Math.abs(label.y - label.originalY) > 2) {
          ctx.strokeStyle = label.color;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.moveTo(label.dataPointX, label.dataPointY);
          ctx.lineTo(label.x - 2, label.y);
          ctx.stroke();
          ctx.globalAlpha = 1.0;
        }

        // Draw label
        ctx.fillStyle = label.color;
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label.text, label.x, label.y);

        // Store bounds for click detection
        labelBoundsRef.current.push({
          x: label.x,
          y: label.y - label.height / 2,
          width: label.width,
          height: label.height,
          label: label.text
        });
      });
    }
  };
}

/**
 * Sets up click and mousemove handlers for clickable labels
 */
export function setupLabelHandlers(canvasRef, labelBoundsRef, onLabelClick) {
  const handleCanvasClick = (event) => {
    const rect = canvasRef.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    for (const bound of labelBoundsRef.current) {
      if (
        x >= bound.x &&
        x <= bound.x + bound.width &&
        y >= bound.y &&
        y <= bound.y + bound.height
      ) {
        if (onLabelClick) {
          onLabelClick(bound.label);
        }
        break;
      }
    }
  };

  const handleCanvasMouseMove = (event) => {
    const rect = canvasRef.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    let overLabel = false;
    for (const bound of labelBoundsRef.current) {
      if (
        x >= bound.x &&
        x <= bound.x + bound.width &&
        y >= bound.y &&
        y <= bound.y + bound.height
      ) {
        overLabel = true;
        break;
      }
    }

    canvasRef.style.cursor = overLabel ? 'pointer' : 'default';
  };

  canvasRef.addEventListener('click', handleCanvasClick);
  canvasRef.addEventListener('mousemove', handleCanvasMouseMove);

  // Return cleanup function
  return () => {
    canvasRef.removeEventListener('click', handleCanvasClick);
    canvasRef.removeEventListener('mousemove', handleCanvasMouseMove);
  };
}
