enum LeftRightComparisonResult {
  IsLeft = 0,
  IsRight = 1,
}
type LeftRightCompareWithFunction<T> = (compareWithValue: T) => LeftRightComparisonResult;
export { LeftRightComparisonResult, type LeftRightCompareWithFunction };
