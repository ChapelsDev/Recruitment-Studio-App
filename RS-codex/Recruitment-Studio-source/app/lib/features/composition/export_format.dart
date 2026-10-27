enum ExportFormat {
  square(1080, 1080),
  portrait(1080, 1350),
  story(1080, 1920);

  const ExportFormat(this.width, this.height);
  final int width;
  final int height;
}
