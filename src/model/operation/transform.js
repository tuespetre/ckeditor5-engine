import InsertOperation from './insertoperation';
import AttributeOperation from './attributeoperation';
import RenameOperation from './renameoperation';
import MarkerOperation from './markeroperation';
import MoveOperation from './moveoperation';
import RemoveOperation from './removeoperation';
import ReinsertOperation from './reinsertoperation';
import RootAttributeOperation from './rootattributeoperation';
import MergeOperation from './mergeoperation';
import SplitOperation from './splitoperation';
import WrapOperation from './wrapoperation';
import UnwrapOperation from './unwrapoperation';
import NoOperation from './nooperation';
import Range from '../range';
import Position from '../position';
import compareArrays from '@ckeditor/ckeditor5-utils/src/comparearrays';

const transformations = new Map();

export function setTransformation( OperationA, OperationB, transformationFunction ) {
	let aGroup = transformations.get( OperationA );

	if ( !aGroup ) {
		aGroup = new Map();
		transformations.set( OperationA, aGroup );
	}

	aGroup.set( OperationB, transformationFunction );
}

function getTransformation( a, b ) {
	const OperationA = a.constructor;
	const OperationB = b.constructor;

	const aGroups = new Set();

	let aGroup = transformations.get( OperationA );

	if ( aGroup ) {
		aGroups.add( aGroup );
	}

	for ( const Operation of transformations.keys() ) {
		if ( a instanceof Operation ) {
			aGroups.add( transformations.get( Operation ) );
		}
	}

	for ( const group of aGroups ) {
		if ( group.has( OperationB ) ) {
			return group.get( OperationB );
		}

		for ( const Operation of group.keys() ) {
			if ( b instanceof Operation ) {
				return group.get( Operation );
			}
		}
	}

	return noUpdateTransformation;
}

function noUpdateTransformation( a ) {
	return [ a.clone() ];
}

function updateBaseVersions( operations, baseVersion ) {
	for ( const operation of operations ) {
		operation.baseVersion = ++baseVersion;
	}

	return operations;
}

function transform( a, b, context = { isStrong: false } ) {
	const transformationFunction = getTransformation( a, b );

	const aTransformed = transformationFunction( a.clone(), b, context );

	return updateBaseVersions( aTransformed, b.baseVersion );
}

export default transform;

function getNoOp() {
	return [ new NoOperation( 0 ) ];
}

function _onSameLevel( aPos, bPos ) {
	const aParentPath = aPos.getParentPath();
	const bParentPath = bPos.getParentPath();

	return compareArrays( aParentPath, bParentPath ) == 'same';
}

function _splitRangeByRange( rangeToSplit, otherRange, includeCommon ) {
	const ranges = rangeToSplit.getDifference( otherRange );
	const common = includeCommon ? rangeToSplit.getIntersection( otherRange ) : null;

	if ( common ) {
		if ( ranges.length == 0 ) {
			ranges.push( common );
		} else if ( ranges.length == 1 ) {
			if ( ranges[ 0 ].start.isBefore( common.start ) ) {
				ranges.push( common );
			} else {
				ranges.unshift( common );
			}
		} else {
			ranges.splice( 1, 0, common );
		}
	}

	return ranges;
}

// -----------------------

setTransformation( AttributeOperation, AttributeOperation, ( a, b, context ) => {
	if ( a.key === b.key ) {
		// If operations attributes are in conflict, check if their ranges intersect and manage them properly.

		// First, we want to apply change to the part of a range that has not been changed by the other operation.
		const operations = a.range.getDifference( b.range ).map( range => {
			return new AttributeOperation( range, a.key, a.oldValue, a.newValue, 0 );
		} );

		// Then we take care of the common part of ranges.
		const common = a.range.getIntersection( b.range );

		if ( common ) {
			// If this operation is more important, we also want to apply change to the part of the
			// original range that has already been changed by the other operation. Since that range
			// got changed we also have to update `oldValue`.
			if ( context.isStrong ) {
				operations.push( new AttributeOperation( common, b.key, b.newValue, a.newValue, 0 ) );
			} else if ( operations.length === 0 ) {
				operations.push( new NoOperation( 0 ) );
			}
		}

		return operations;
	} else {
		// If operations don't conflict, simply return an array containing just a clone of this operation.
		return [ a ];
	}
} );

setTransformation( AttributeOperation, InsertOperation, ( a, b ) => {
	const ranges = a.range._getTransformedByInsertion( b.position, b.howMany, true );

	// Create `AttributeOperation`s out of the ranges.
	const result = ranges.map( range => {
		return new AttributeOperation( range, a.key, a.oldValue, a.newValue, a.baseVersion );
	} );

	// Case 1:	`AttributeOperation#range` includes some newly inserted text.
	//			The operation should also change the attribute of that text.
	//
	//			Bold should be applied on the following range:
	//			<p>Fo[zb]ar</p>
	//
	//			New text is typed:
	//			<p>Fozxxbar</p>
	//
	//			Bold should be applied also on the new text:
	//			<p>Fo<$text bold=true>zxxb</$text>ar</p>
	//
	//			Keep in mind that this is should not work the same for elements.
	//
	//			Instead of expanding the attribute operation range, it is needed to create a new attribute operation.
	//			This is because the inserted text might have already an attribute applied and the `oldValue` property
	//			of the attribute operation might be wrong:
	//
	//			Attribute `highlight="yellow"` should be applied on the following range:
	//			<p>Fo[zb]ar<p>
	//
	//			New text with `highlight="red"` is typed:
	//			<p>Fo[z<$text higlight="red">x</$text>a]r</p>
	//
	//			In this case three operations are needed: `oldValue=null, newValue="yellow"` for `z`, `oldValue="red",
	//			newValue="yellow"` for `x` and `oldValue=null, newValue="yellow"` for `a`. It could even happen that
	//			there are multiple nodes with different `oldValue`s are inserted, so multiple new operations might be added.
	//
	if ( b.shouldReceiveAttributes && _onSameLevel( a.range.start, b.position ) && a.range.containsPosition( b.position ) ) {
		// Put the new operations in between the other two ranges.
		result.splice( 1, 0, ..._getComplementaryAttributeOperations( a, b ) );
	}

	// Map transformed range(s) to operations and return them.
	return result;
} );

function _getComplementaryAttributeOperations( attributeOperation, insertOperation ) {
	const nodes = insertOperation.nodes;
	const result = [];

	// At the beginning we store the attribute value from the first node.
	let val = nodes.getNode( 0 ).getAttribute( attributeOperation.key );

	// This stores the last index of node list where the attribute value has changed.
	// We need it to create separate `AttributeOperation`s for nodes with different attribute values.
	let lastOffset = 0;

	// Sum of offsets of already processed nodes.
	let offsetSum = nodes.getNode( 0 ).offsetSize;

	for ( let i = 1; i < nodes.length; i++ ) {
		const node = nodes.getNode( i );
		const nodeAttrVal = node.getAttribute( attributeOperation.key );

		// If previous node has different attribute value, we will create an operation to the point before current node.
		// So all nodes with the same attributes up to this point will be included in one `AttributeOperation`.
		if ( nodeAttrVal != val ) {
			// New operation is created only when it is needed. If given node already has proper value for this
			// attribute we simply skip it without adding a new operation.
			if ( val != attributeOperation.newValue ) {
				addOperation();
			}

			val = nodeAttrVal;
			lastOffset = offsetSum;
		}

		offsetSum = offsetSum + node.offsetSize;
	}

	// At the end we have to add additional `AttributeOperation` for the last part of node list.
	// If all nodes on the node list had same attributes, this will be the only returned operation.
	addOperation();

	return result;

	function addOperation() {
		const range = new Range(
			insertOperation.position.getShiftedBy( lastOffset ),
			insertOperation.position.getShiftedBy( offsetSum )
		);

		result.push(
			new AttributeOperation( range, attributeOperation.key, val, attributeOperation.newValue, 0 )
		);
	}
}

setTransformation( AttributeOperation, MergeOperation, ( a, b ) => {
	a.range = a.range._getTransformedByMergeOperation( b );

	return [ a ];
} );

setTransformation( AttributeOperation, MoveOperation, ( a, b ) => {
	const ranges = a.range._getTransformedByMoveOperation( b, true );

	// Create `AttributeOperation`s out of the ranges.
	return ranges.map( range => {
		return new AttributeOperation( range, a.key, a.oldValue, a.newValue, a.baseVersion );
	} );
} );

setTransformation( AttributeOperation, SplitOperation, ( a, b ) => {
	// Case 1:	Split node is the last node in `AttributeOperation#range`.
	//			`AttributeOperation#range` needs to be expanded to include the new (split) node.
	//
	//			<listItem type="bulleted">foobar</listItem>
	//
	//			After split:
	//			<listItem type="bulleted">foo</listItem><listItem type="bulleted">bar</listItem>
	//
	//			After attribute change:
	//			<listItem type="numbered">foo</listItem><listItem type="numbered">foo</listItem>
	//
	if ( a.range.end.isEqual( b.insertionPosition ) ) {
		a.range.end.offset++;

		return [ a ];
	}

	// Case 2:	Split is inside `AttributeOperation#range` but the parent is not inside that range.
	//			Transformed attribute operation should not include the element created by split.
	//
	//			Content with range-to-change and split position:
	//			<p>Fo[zb^a]r</p>
	//
	//			After split:
	//			<p>Fo[zb</p><p>a]r</p>
	//
	//			Transformed range contains the new element. This is wrong. It should be like this:
	//			<p>Fo[zb]</p><p>[a]r</p>
	//
	if ( _onSameLevel( a.range.start, b.position ) && a.range.containsPosition( b.position ) ) {
		const secondPart = a.clone();

		secondPart.range.start = Position.createFromPosition( b.moveTargetPosition );
		secondPart.range.end = a.range.end._getCombined( b.position, b.moveTargetPosition );

		a.range.end = Position.createFromPosition( b.position );

		return [ a, secondPart ];
	}

	// The default case.
	//
	a.range = a.range._getTransformedBySplitOperation( b );

	return [ a ];
} );

setTransformation( AttributeOperation, WrapOperation, ( a, b ) => {
	// Case 1:	`AttributeOperation#range` and range to wrap intersect only partially.
	//			Two `AttributeOperation`s are needed to handle this situation as, after wrapping, the nodes
	//			to change are in different parents.
	//
	//			Both list items' type should be changed to numbered:
	//			[<listItem type="bulleted">Foo</listItem><listItem type="bulleted">Bar</listItem>]
	//
	//			Wrap one of the items inside block quote:
	//			<blockQuote><listItem type="bulleted">Foo</listItem></blockQuote><listItem type="bulleted">Bar</listItem>
	//
	//			Two operations are needed:
	//			<blockQuote>[<listItem type="bulleted">Foo</listItem>]</blockQuote>[<listItem type="bulleted">Bar</listItem>]
	//
	//			There might be three ranges needed, if the attribute operation range started before and ended after the wrap range.
	//
	if ( _onSameLevel( a.range.start, b.position ) ) {
		const ranges = a.range.getDifference( b.wrappedRange );
		const common = a.range.getIntersection( b.wrappedRange );

		if ( common ) {
			ranges.push( common );
		}

		// Create `AttributeOperation`s out of the ranges.
		return ranges.map( range => {
			return new AttributeOperation( range._getTransformedByWrapOperation( b ), a.key, a.oldValue, a.newValue, 0 );
		} );
	}

	// The default case.
	//
	a.range = a.range._getTransformedByWrapOperation( b );

	return [ a ];
} );

setTransformation( AttributeOperation, UnwrapOperation, ( a, b ) => {
	a.range = a.range._getTransformedByUnwrapOperation( b );

	return [ a ];
} );

// -----------------------

setTransformation( InsertOperation, AttributeOperation, ( a, b ) => {
	const result = [ a ];

	if ( a.shouldReceiveAttributes && b.range.containsPosition( a.position ) ) {
		result.push( ..._getComplementaryAttributeOperations( b, a ) );
	}

	return result;
} );

setTransformation( InsertOperation, InsertOperation, ( a, b, context ) => {
	if ( a.position.isEqual( b.position ) && context.isStrong ) {
		return [ a ];
	}

	a.position = a.position._getTransformedByInsertOperation( b );

	return [ a ];
} );

setTransformation( InsertOperation, MoveOperation, ( a, b, context ) => {
	if ( a.position.isEqual( b.targetPosition ) && context.isStrong ) {
		return [ a ];
	}

	a.position = a.position._getTransformedByMoveOperation( b );

	return [ a ];
} );

setTransformation( InsertOperation, SplitOperation, ( a, b ) => {
	a.position = a.position._getTransformedBySplitOperation( b );

	return [ a ];
} );

setTransformation( InsertOperation, MergeOperation, ( a, b ) => {
	a.position = a.position._getTransformedByMergeOperation( b );

	return [ a ];
} );

setTransformation( InsertOperation, WrapOperation, ( a, b ) => {
	a.position = a.position._getTransformedByWrapOperation( b );

	return [ a ];
} );

setTransformation( InsertOperation, UnwrapOperation, ( a, b ) => {
	a.position = a.position._getTransformedByUnwrapOperation( b );

	return [ a ];
} );

// -----------------------

setTransformation( MarkerOperation, InsertOperation, ( a, b ) => {
	if ( a.oldRange ) {
		a.oldRange = a.oldRange._getTransformedByInsertOperation( b )[ 0 ];
	}

	if ( a.newRange ) {
		a.newRange = a.newRange._getTransformedByInsertOperation( b )[ 0 ];
	}

	return [ a ];
} );

setTransformation( MarkerOperation, MarkerOperation, ( a, b, context ) => {
	if ( a.name == b.name ) {
		if ( context.isStrong ) {
			a.oldRange = Range.createFromRange( b.newRange );
		} else {
			return getNoOp();
		}
	}

	return [ a ];
} );

setTransformation( MarkerOperation, MergeOperation, ( a, b ) => {
	if ( a.oldRange ) {
		a.oldRange = a.oldRange._getTransformedByMergeOperation( b );
	}

	if ( a.newRange ) {
		a.newRange = a.newRange._getTransformedByMergeOperation( b );
	}

	return [ a ];
} );

setTransformation( MarkerOperation, MoveOperation, ( a, b ) => {
	if ( a.oldRange ) {
		a.oldRange = Range.createFromRanges( a.oldRange._getTransformedByMoveOperation( b ) );
	}

	if ( a.newRange ) {
		a.newRange = Range.createFromRanges( a.newRange._getTransformedByMoveOperation( b ) );
	}

	return [ a ];
} );

setTransformation( MarkerOperation, SplitOperation, ( a, b ) => {
	if ( a.oldRange ) {
		a.oldRange = a.oldRange._getTransformedBySplitOperation( b );
	}

	if ( a.newRange ) {
		a.newRange = a.newRange._getTransformedBySplitOperation( b );
	}

	return [ a ];
} );

setTransformation( MarkerOperation, WrapOperation, ( a, b ) => {
	if ( a.oldRange ) {
		a.oldRange = a.oldRange._getTransformedByWrapOperation( b );
	}

	if ( a.newRange ) {
		a.newRange = a.newRange._getTransformedByWrapOperation( b );
	}

	return [ a ];
} );

setTransformation( MarkerOperation, UnwrapOperation, ( a, b ) => {
	if ( a.oldRange ) {
		a.oldRange = a.oldRange._getTransformedByUnwrapOperation( b );
	}

	if ( a.newRange ) {
		a.newRange = a.newRange._getTransformedByUnwrapOperation( b );
	}

	return [ a ];
} );

// -----------------------

setTransformation( MergeOperation, InsertOperation, ( a, b ) => {
	a.sourcePosition = a.sourcePosition._getTransformedByInsertOperation( b );
	a.targetPosition = a.targetPosition._getTransformedByInsertOperation( b );

	return [ a ];
} );

setTransformation( MergeOperation, MergeOperation, ( a, b, context ) => {
	if ( a.sourcePosition.isEqual( b.sourcePosition ) ) {
		if ( !context.isStrong || a.targetPosition.isEqual( b.targetPosition ) ) {
			return getNoOp();
		}
	}

	a.sourcePosition = a.sourcePosition._getTransformedByMergeOperation( b );
	a.targetPosition = a.targetPosition._getTransformedByMergeOperation( b );

	return [ a ];
} );

setTransformation( MergeOperation, MoveOperation, ( a, b ) => {
	// Case 1:	The element to merge got removed.
	//			Merge operation does support merging elements which are not siblings. So it would not be a problem
	//			from technical point of view. However, if the element was removed, the intention of the user
	//			deleting it was to have it all deleted. From user experience point of view, moving back the
	//			removed nodes might be unexpected. This means that in this scenario we will block the merging.
	//
	const removedRange = Range.createFromPositionAndShift( b.sourcePosition, b.howMany );

	if ( b instanceof RemoveOperation ) {
		if ( _onSameLevel( a.deletionPosition, b.sourcePosition ) && removedRange.containsPosition( a.sourcePosition ) ) {
			return getNoOp();
		}
	}

	a.sourcePosition = a.sourcePosition._getTransformedByMoveOperation( b );
	a.targetPosition = a.targetPosition._getTransformedByMoveOperation( b );

	return [ a ];
} );

setTransformation( MergeOperation, SplitOperation, ( a, b ) => {
	a.sourcePosition = a.sourcePosition._getTransformedBySplitOperation( b );
	a.targetPosition = a.targetPosition._getTransformedBySplitOperation( b );

	return [ a ];
} );

setTransformation( MergeOperation, WrapOperation, ( a, b ) => {
	a.sourcePosition = a.sourcePosition._getTransformedByWrapOperation( b );
	a.targetPosition = a.targetPosition._getTransformedByWrapOperation( b );

	return [ a ];
} );

setTransformation( MergeOperation, UnwrapOperation, ( a, b ) => {
	// Case 1:	The element to merge to unwrapped.
	//			There are multiple possible solution to resolve this conflict:
	//			 * unwrap also merge target (all nodes are unwrapped),
	//			 * move the unwrapped nodes to the merge target (no nodes stayed unwrapped),
	//			 * cancel the merge (some nodes are unwrapped and some are not).
	//
	if ( a.sourcePosition.isEqual( b.position ) ) {
		return getNoOp();
	}

	a.sourcePosition = a.sourcePosition._getTransformedByUnwrapOperation( b );
	a.targetPosition = a.targetPosition._getTransformedByUnwrapOperation( b );

	return [ a ];
} );

// -----------------------

setTransformation( MoveOperation, InsertOperation, ( a, b, context ) => {
	const moveRange = Range.createFromPositionAndShift( a.sourcePosition, a.howMany );
	const transformed = moveRange._getTransformedByInsertOperation( b, false )[ 0 ];

	a.sourcePosition = transformed.start;
	a.howMany = transformed.end.offset - transformed.start.offset;

	if ( !a.targetPosition.isEqual( b.position ) || !context.isStrong ) {
		a.targetPosition = a.targetPosition._getTransformedByInsertOperation( b );
	}

	return [ a ];
} );

// setTransformation( MoveOperation, MoveOperation, ( a, b, context ) => {
// 	const rangeA = Range.createFromPositionAndShift( a.sourcePosition, a.howMany );
// 	const rangeB = Range.createFromPositionAndShift( b.sourcePosition, b.howMany );
//
// 	let isStrong = context.isStrong;
//
// 	if ( !( a instanceof RemoveOperation ) && b instanceof RemoveOperation ) {
// 		isStrong = false;
// 	}
//
// 	let newTargetPosition = a.targetPosition._getTransformedByMoveOperation( b );
//
// 	if ( a.targetPosition.isEqual( b.targetPosition ) && context.isStrong ) {
// 		// By default move transformation will move the position to the right if positions are same.
// 		// So if the positions are same but `a` operation is stronger, we need to re-move it before the nodes inserted by `b` operation.
// 		newTargetPosition = newTargetPosition.getShiftedBy( -b.howMany );
// 	}
//
// 	// Case 1:	Very edgy case where both operations target inside the other operation range.
// 	//			Just reverse the operations like they did not happen.
// 	//
// 	if ( moveTargetIntoMovedRange( a, b ) && moveTargetIntoMovedRange( b, a ) ) {
// 		return [ b.getReversed() ];
// 	}
//
// 	// Case 2:	Ranges are same. Depending on which is stronger, the operation should become no-operation.
// 	if ( rangeA.isEqual( rangeB ) && !context.isStrong ) {
// 		return getNoOp();
// 	}
//
// 	// Case 3:	Ranges to move are not on the same level, so those operations don't move the same nodes. This is an
// 	//			easy situation to solve. Operation `a` range might have moved but is kept together.
// 	//
// 	if ( !_onSameLevel( a.sourcePosition, b.sourcePosition ) ) {
// 		const newRange = rangeA._getTransformedByMoveOperation( b )[ 0 ];
//
// 		a.sourcePosition = newRange.start;
// 		a.howMany = newRange.end.offset - newRange.start.offset;
// 		a.targetPosition = newTargetPosition;
//
// 		return [ a ];
// 	}
//
// 	// Case 4:	Ranges are on the same level. In this case the ranges may intersect. Two ranges-to-move might
// 	//			need to be generated. For example, if some nodes in operation `a` range were moved by operation `b`,
// 	//			if operation `a` is stronger, the nodes need to be moved again to the operation `a` target position.
// 	//
// 	let common = rangeA.getIntersection( rangeB );
// 	const differenceSet = rangeA.getDifference( rangeB );
//
// 	const moveCommonPart = isStrong || rangeB.containsPosition( a.targetPosition );
//
// 	if ( common && differenceSet.length == 1 && !rangeA.containsPosition( b.targetPosition ) && moveCommonPart ) {
// 		let difference = differenceSet[ 0 ]._getTransformedByMoveOperation( b )[ 0 ];
//
// 		common = common._getTransformedByMoveOperation( b )[ 0 ];
//
// 		if ( rangeA.start.isBefore( rangeB.start ) ) {
// 			// Difference part was before common part in the original range.
// 			const differenceOp = makeMoveOperation( difference, newTargetPosition );
//
// 			const commonOp = makeMoveOperation(
// 				common._getTransformedByMoveOperation( differenceOp )[ 0 ],
// 				newTargetPosition._getTransformedByMoveOperation( differenceOp )
// 			);
//
// 			return [ differenceOp, commonOp ];
// 		} else {
// 			// Common part was before difference part in the original range.
// 			const commonOp = makeMoveOperation( common, newTargetPosition );
//
// 			const differenceOp = makeMoveOperation(
// 				difference._getTransformedByMoveOperation( commonOp )[ 0 ],
// 				newTargetPosition._getTransformedByMoveOperation( commonOp )
// 			);
//
// 			return [ commonOp, differenceOp ];
// 		}
// 	}
//
// 	// Case 5:	Ranges are on the same level but are not intersecting in a conflicting way.
// 	//
// 	const newRange = rangeB.containsRange( rangeA, true ) ?
// 		rangeA._getTransformedByMoveOperation( b )[ 0 ] :
// 		rangeA._getTransformedByDeletion( b.sourcePosition, b.howMany )._getTransformedByMoveOperation( b )[ 0 ];
//
// 	a.sourcePosition = newRange.start;
// 	a.howMany = newRange.end.offset - newRange.start.offset;
// 	a.targetPosition = newTargetPosition;
//
// 	return [ a ];
// } );

setTransformation( MoveOperation, MoveOperation, ( a, b, context ) => {
	//
	// Setting and evaluating some variables that will be used in special cases and default algorithm.
	//
	// Create ranges from `MoveOperations` properties.
	const rangeA = Range.createFromPositionAndShift( a.sourcePosition, a.howMany );
	const rangeB = Range.createFromPositionAndShift( b.sourcePosition, b.howMany );

	// Assign `context.isStrong` to a different variable, because the value may change during execution of
	// this algorithm and we do not want to override original `context.isStrong` that will be used in later transformations.
	let isStrong = context.isStrong;

	// `a.targetPosition` could be affected by the `b` operation. We will transform it.
	const newTargetPosition = a.targetPosition._getTransformedByMove(
		b.sourcePosition,
		b.targetPosition,
		b.howMany
	);

	//
	// Special case #1 + mirror.
	//
	// Special case when both move operations' target positions are inside nodes that are
	// being moved by the other move operation. So in other words, we move ranges into inside of each other.
	// This case can't be solved reasonably (on the other hand, it should not happen often).
	if ( moveTargetIntoMovedRange( a, b ) && moveTargetIntoMovedRange( b, a ) ) {
		// Instead of transforming operation, we return a reverse of the operation that we transform by.
		// So when the results of this "transformation" will be applied, `b` MoveOperation will get reversed.
		return [ b.getReversed() ];
	}
	//
	// End of special case #1.
	//

	//
	// Special case #2.
	//
	// Check if `b` operation targets inside `rangeA`. Use stickiness if possible.
	const bTargetsToA = rangeA.containsPosition( b.targetPosition );

	// If `b` targets to `rangeA` and `rangeA` contains `rangeB`, `b` operation has no influence on `a` operation.
	// You might say that operation `b` is captured inside operation `a`.
	if ( bTargetsToA && rangeA.containsRange( rangeB, true ) ) {
		// There is a mini-special case here, where `rangeB` is on other level than `rangeA`. That's why
		// we need to transform `a` operation anyway.
		rangeA.start = rangeA.start._getTransformedByMove( b.sourcePosition, b.targetPosition, b.howMany );
		rangeA.end = rangeA.end._getTransformedByMove( b.sourcePosition, b.targetPosition, b.howMany );

		return makeMoveOperationsFromRanges( [ rangeA ], newTargetPosition, a );
	}

	//
	// Special case #2 mirror.
	//
	const aTargetsToB = rangeB.containsPosition( a.targetPosition );

	if ( aTargetsToB && rangeB.containsRange( rangeA, true ) ) {
		// `a` operation is "moved together" with `b` operation.
		// Here, just move `rangeA` "inside" `rangeB`.
		rangeA.start = rangeA.start._getCombined( b.sourcePosition, b.getMovedRangeStart() );
		rangeA.end = rangeA.end._getCombined( b.sourcePosition, b.getMovedRangeStart() );

		return makeMoveOperationsFromRanges( [ rangeA ], newTargetPosition, a );
	}
	//
	// End of special case #2.
	//

	//
	// Special case #3 + mirror.
	//
	// `rangeA` has a node which is an ancestor of `rangeB`. In other words, `rangeB` is inside `rangeA`
	// but not on the same tree level. In such case ranges have common part but we have to treat it
	// differently, because in such case those ranges are not really conflicting and should be treated like
	// two separate ranges. Also we have to discard two difference parts.
	const aCompB = compareArrays( a.sourcePosition.getParentPath(), b.sourcePosition.getParentPath() );

	if ( aCompB == 'prefix' || aCompB == 'extension' ) {
		// Transform `rangeA` by `b` operation and make operation out of it, and that's all.
		// Note that this is a simplified version of default case, but here we treat the common part (whole `rangeA`)
		// like a one difference part.
		rangeA.start = rangeA.start._getTransformedByMove( b.sourcePosition, b.targetPosition, b.howMany );
		rangeA.end = rangeA.end._getTransformedByMove( b.sourcePosition, b.targetPosition, b.howMany );

		return makeMoveOperationsFromRanges( [ rangeA ], newTargetPosition, a );
	}
	//
	// End of special case #3.
	//

	//
	// Default case - ranges are on the same level or are not connected with each other.
	//
	// Modifier for default case.
	// Modifies `isStrong` flag in certain conditions.
	//
	// If only one of operations is a remove operation, we force remove operation to be the "stronger" one
	// to provide more expected results. This is done only if `context.forceWeakRemove` is set to `false`.
	// `context.forceWeakRemove` is set to `true` in certain conditions when transformation takes place during undo.
	if ( a instanceof RemoveOperation && !( b instanceof RemoveOperation ) ) {
		isStrong = true;
	} else if ( !( a instanceof RemoveOperation ) && b instanceof RemoveOperation ) {
		isStrong = false;
	}

	// Handle operation's source ranges - check how `rangeA` is affected by `b` operation.
	// This will aggregate transformed ranges.
	const ranges = [];

	// Get the "difference part" of `a` operation source range.
	// This is an array with one or two ranges. Two ranges if `rangeB` is inside `rangeA`.
	const difference = rangeA.getDifference( rangeB );

	for ( const range of difference ) {
		// Transform those ranges by `b` operation. For example if `b` moved range from before those ranges, fix those ranges.
		range.start = range.start._getTransformedByDeletion( b.sourcePosition, b.howMany );
		range.end = range.end._getTransformedByDeletion( b.sourcePosition, b.howMany );

		// If `b` operation targets into `rangeA` on the same level, spread `rangeA` into two ranges.
		const shouldSpread = compareArrays( range.start.getParentPath(), b.getMovedRangeStart().getParentPath() ) == 'same';
		const newRanges = range._getTransformedByInsertion( b.getMovedRangeStart(), b.howMany, shouldSpread );

		ranges.push( ...newRanges );
	}

	// Then, we have to manage the "common part" of both move ranges.
	const common = rangeA.getIntersection( rangeB );

	if ( common !== null && isStrong && !bTargetsToA ) {
		// Calculate the new position of that part of original range.
		common.start = common.start._getCombined( b.sourcePosition, b.getMovedRangeStart() );
		common.end = common.end._getCombined( b.sourcePosition, b.getMovedRangeStart() );

		// Take care of proper range order.
		//
		// Put `common` at appropriate place. Keep in mind that we are interested in original order.
		// Basically there are only three cases: there is zero, one or two difference ranges.
		//
		// If there is zero difference ranges, just push `common` in the array.
		if ( ranges.length === 0 ) {
			ranges.push( common );
		}
		// If there is one difference range, we need to check whether common part was before it or after it.
		else if ( ranges.length == 1 ) {
			if ( rangeB.start.isBefore( rangeA.start ) || rangeB.start.isEqual( rangeA.start ) ) {
				ranges.unshift( common );
			} else {
				ranges.push( common );
			}
		}
		// If there are more ranges (which means two), put common part between them. This is the only scenario
		// where there could be two difference ranges so we don't have to make any comparisons.
		else {
			ranges.splice( 1, 0, common );
		}
	}

	if ( ranges.length === 0 ) {
		// If there are no "source ranges", nothing should be changed.
		// Note that this can happen only if `isStrong == false` and `rangeA.isEqual( rangeB )`.
		return [ new NoOperation( a.baseVersion ) ];
	}

	return makeMoveOperationsFromRanges( ranges, newTargetPosition, a );
} );

setTransformation( MoveOperation, SplitOperation, ( a, b ) => {
	// Case 1:	Last element in the moved range got split.
	//			In this case the default range transformation will not work correctly as the element created by
	//			split operation would be outside the range. The range to move needs to be fixed manually.
	//
	//			Note that there is no need to update target position in this case because split cannot influence it
	//			in any way if it is inside the range to move.
	//
	const moveRange = Range.createFromPositionAndShift( a.sourcePosition, a.howMany );

	if ( moveRange.end.isEqual( b.insertionPosition ) ) {
		a.howMany++;

		return [ a ];
	}

	const newTargetPosition = a.targetPosition._getTransformedBySplitOperation( b );

	// Case 2:	Split happened between the moved nodes. In this case two ranges to move need to be generated.
	//
	//			Characters `ozba` are moved to the end of paragraph `Xyz` but split happened.
	//			<p>F[oz|ba]r</p><p>Xyz</p>
	//
	//			After split:
	//			<p>F[oz</p><p>ba]r</p><p>Xyz</p>
	//
	//			Correct ranges:
	//			<p>F[oz]</p><p>[ba]r</p><p>Xyz</p>
	//
	//			After move:
	//			<p>F</p><p>r</p><p>Xyzozba</p>
	//
	if ( _onSameLevel( moveRange.start, b.position ) && moveRange.containsPosition( b.position ) ) {
		let rightRange = new Range( b.position, moveRange.end );
		rightRange = rightRange._getTransformedBySplitOperation( b );

		// Add the right range first, so that if both ranges are inserted at `newTargetPosition`, they are in the correct order.
		//
		// Target position is ^:
		//
		// <p>F[oz]</p><p>[ba]r</p><p>Xyz^</p>
		// <p>F[oz]</p><p>r</p><p>Xyz^ba</p>
		// <p>F</p><p>r</p><p>Xyzozba</p>
		//
		return [
			new MoveOperation( rightRange.start, rightRange.end.offset - rightRange.start.offset, newTargetPosition, 0 ),
			new MoveOperation( moveRange.start, b.position.offset - moveRange.start.offset, newTargetPosition, 0 )
		];
	}

	// The default case.
	//
	const transformed = moveRange._getTransformedBySplitOperation( b );

	a.sourcePosition = transformed.start;
	a.howMany = transformed.end.offset - transformed.start.offset;
	a.targetPosition = newTargetPosition;

	return [ a ];
} );

setTransformation( MoveOperation, MergeOperation, ( a, b ) => {
	const moveRange = Range.createFromPositionAndShift( a.sourcePosition, a.howMany );
	const transformed = moveRange._getTransformedByMergeOperation( b );

	a.sourcePosition = transformed.start;
	a.howMany = transformed.end.offset - transformed.start.offset;
	a.targetPosition = a.targetPosition._getTransformedByMergeOperation( b );

	return [ a ];
} );

setTransformation( MoveOperation, WrapOperation, ( a, b ) => {
	const moveRange = Range.createFromPositionAndShift( a.sourcePosition, a.howMany );
	const newTargetPosition = a.targetPosition._getTransformedBySplitOperation( b );

	// Case 1:	Some of the nodes to move got wrapped. In this case multiple ranges to move might need to be generated.
	//
	//			First paragraph and the image should are wrapped, while the two images are moved after the last paragraph:
	//			[<paragraph>Foo</paragraph>{<image />]<image />}<paragraph>Bar</paragraph>
	//
	//			After wrap:
	//			<blockQuote><paragraph>Foo</paragraph>[<image />]</blockQuote>[<image />]<paragraph>Bar</paragraph>
	//
	//			After move:
	//			<blockQuote><paragraph>Foo</paragraph></blockQuote><paragraph>Bar</paragraph><image /><image />
	//
	if ( _onSameLevel( a.sourcePosition, b.position ) ) {
		// If move range contains or is equal to the wrapped range, just move it all together.
		// Change `howMany` to reflect that nodes got wrapped.
		if ( moveRange.containsRange( b.wrappedRange, true ) ) {
			a.howMany = a.howMany - b.howMany + 1;

			return [ a ];
		}

		const result = [];

		let difference = moveRange.getDifference( b.wrappedRange )[ 0 ];
		let common = moveRange.getIntersection( b.wrappedRange );

		if ( difference ) {
			difference = difference._getTransformedByWrapOperation( b );

			result.push( new MoveOperation( difference.start, difference.end.offset - difference.start.offset, newTargetPosition, 0 ) );
		}

		if ( common ) {
			common = common._getTransformedByWrapOperation( b );

			result.push( new MoveOperation( common.start, common.end.offset - common.start.offset, newTargetPosition, 0 ) );
		}

		return result;
	}

	// The default case.
	//
	const transformed = moveRange._getTransformedByMergeOperation( b );

	a.sourcePosition = transformed.start;
	a.howMany = transformed.end.offset - transformed.start.offset;
	a.targetPosition = newTargetPosition;

	return [ a ];
} );

setTransformation( MoveOperation, UnwrapOperation, ( a, b ) => {
	const moveRange = Range.createFromPositionAndShift( a.sourcePosition, a.howMany );
	const transformed = moveRange._getTransformedByUnwrapOperation( b );

	a.sourcePosition = transformed.start;
	a.howMany = transformed.end.offset - transformed.start.offset;
	a.targetPosition = a.targetPosition._getTransformedByUnwrapOperation( b );

	return [ a ];
} );

// -----------------------

setTransformation( RenameOperation, InsertOperation, ( a, b ) => {
	a.position = a.position._getTransformedByInsertOperation( b );

	return [ a ];
} );

setTransformation( RenameOperation, MergeOperation, ( a, b ) => {
	a.position = a.position._getTransformedByMergeOperation( b );

	return [ a ];
} );

setTransformation( RenameOperation, MoveOperation, ( a, b ) => {
	a.position = a.position._getTransformedByMoveOperation( b );

	return [ a ];
} );

setTransformation( RenameOperation, RenameOperation, ( a, b, context ) => {
	if ( a.position.isEqual( b.position ) ) {
		if ( context.isStrong ) {
			a.oldName = b.newName;
		} else {
			return getNoOp();
		}
	}

	return [ a ];
} );

setTransformation( RenameOperation, SplitOperation, ( a, b ) => {
	// Case 1:	The element to rename has been split. In this case, the new element should be also renamed.
	//
	//			This element should be renamed:
	//			<paragraph>Foobar</paragraph>
	//
	//			After split:
	//			<paragraph>Foo</paragraph><paragraph>bar</paragraph>
	//
	//			Rename both elements:
	//			<listItem>Foo</listItem><listItem>bar</listItem>
	//
	const renamePath = a.position.path;
	const splitPath = b.position.getParentPath();

	if ( compareArrays( renamePath, splitPath ) == 'same' ) {
		const extraRename = new RenameOperation( a.position.getShiftedBy( 1 ), a.oldName, a.newName, 0 );

		return [ a, extraRename ];
	}

	// The default case.
	//
	a.position = a.position._getTransformedBySplitOperation( b );

	return [ a ];
} );

setTransformation( RenameOperation, MergeOperation, ( a, b ) => {
	// Case 1:	The renamed element got merged. Cancel the rename.
	//
	const aPath = a.position.path;
	const bPath = b.sourcePosition.getParentPath();

	if ( compareArrays( aPath, bPath ) == 'same' ) {
		return getNoOp();
	}

	a.position = a.position._getTransformedByMergeOperation( b );

	return [ a ];
} );

setTransformation( RenameOperation, WrapOperation, ( a, b ) => {
	a.position = a.position._getTransformedByWrapOperation( b );

	return [ a ];
} );

setTransformation( RenameOperation, UnwrapOperation, ( a, b ) => {
	// Case 1:	The renamed element got unwrapped. Cancel the rename.
	//
	const aPath = a.position.path;
	const bPath = b.position.getParentPath();

	if ( compareArrays( aPath, bPath ) == 'same' ) {
		return getNoOp();
	}

	a.position = a.position._getTransformedByUnwrapOperation( b );

	return [ a ];
} );

// -----------------------

setTransformation( RootAttributeOperation, RootAttributeOperation, ( a, b, context ) => {
	if ( a.root === b.root && a.key === b.key ) {
		if ( !context.isStrong || a.newValue === b.newValue ) {
			return [ new NoOperation( 0 ) ];
		} else {
			a.oldValue = b.newValue;
		}
	}

	return [ a ];
} );

// -----------------------

setTransformation( SplitOperation, InsertOperation, ( a, b ) => {
	a.position = a.position._getTransformedByInsertOperation( b );

	return [ a ];
} );

setTransformation( SplitOperation, MergeOperation, ( a, b ) => {
	a.position = a.position._getTransformedByMergeOperation( b );

	return [ a ];
} );

setTransformation( SplitOperation, MoveOperation, ( a, b ) => {
	// Case 1:	If the split position is inside the moved range, we need to move the split position to a proper place.
	//			The position cannot be moved together with moved range because that would result in splitting an incorrect element.
	//
	//			Characters `bc` should be moved to the second paragraph while split position is between them:
	//			<paragraph>A[b|c]d</paragraph><paragraph>Xyz</paragraph>
	//
	//			After move, new split position is incorrect:
	//			<paragraph>Ad</paragraph><paragraph>Xb|cyz</paragraph>
	//
	//			Correct split position:
	//			<paragraph>A|d</paragraph><paragraph>Xbcyz</paragraph>
	//
	//			After split:
	//			<paragraph>A</paragraph><paragraph>d</paragraph><paragraph>Xbcyz</paragraph>
	//
	const rangeToMove = Range.createFromPositionAndShift( b.sourcePosition, b.howMany );

	if ( _onSameLevel( a.position, b.sourcePosition ) && rangeToMove.containsPosition( a.position ) ) {
		a.position = Position.createFromPosition( b.sourcePosition );

		return [ a ];
	}

	// The default case.
	//
	a.position = a.position._getTransformedByMoveOperation( b );

	return [ a ];
} );

setTransformation( SplitOperation, SplitOperation, ( a, b ) => {
	a.position = a.position._getTransformedBySplitOperation( b );

	return [ a ];
} );

setTransformation( SplitOperation, WrapOperation, ( a, b ) => {
	// Case 1:	If split position has been wrapped, reverse the wrapping so that split can be applied as intended.
	//			This is an edge case scenario where it is difficult to find a correct solution.
	//			Since it will be a rare (or only theoretical) scenario, the algorithm will perform the easy solution.
	//
	if ( b.wrappedRange.containsPosition( a.position ) ) {
		return [ b.getReversed(), a ];
	}

	a.position = a.position._getTransformedByWrapOperation( b );

	return [ a ];
} );

setTransformation( SplitOperation, UnwrapOperation, ( a, b ) => {
	// Case 1:	If the element to split got unwrapped, cancel the split as there is nothing to split anymore.
	//
	if ( b.unwrappedRange.containsPosition( a.position ) ) {
		return getNoOp();
	}

	a.position = a.position._getTransformedByUnwrapOperation( b );

	return [ a ];
} );

// -----------------------

setTransformation( WrapOperation, InsertOperation, ( a, b ) => {
	const transformed = a.wrappedRange._getTransformedByInsertOperation( b, false )[ 0 ];

	a.position = transformed.start;
	a.howMany = transformed.end.offset - transformed.start.offset;

	return [ a ];
} );

setTransformation( WrapOperation, MergeOperation, ( a, b ) => {
	const transformed = a.wrappedRange._getTransformedByMergeOperation( b );

	a.position = transformed.start;
	a.howMany = transformed.end.offset - transformed.start.offset;

	return [ a ];
} );

setTransformation( WrapOperation, MoveOperation, ( a, b ) => {
	// Case 1:	The nodes to wrap are in the same parent as the moved range.
	//			In this case, only nodes that has not been moved should be wrapped.
	//
	//			First paragraph and the image should be wrapped, but the image is moved away (or removed).
	//			[<paragraph>Foo</paragraph><image />]<paragraph>Bar</paragraph>
	//
	//			Wrap only the remaining paragraph:
	//			[<paragraph>Foo</paragraph>]<paragraph>Bar</paragraph>
	//
	//			After wrap:
	//			<blockQuote><paragraph>Foo</paragraph></blockQuote><paragraph>Bar</paragraph>
	//
	if ( _onSameLevel( a.position, b.sourcePosition ) ) {
		const moveRange = Range.createFromPositionAndShift( b.sourcePosition, b.howMany );
		const remainingRange = a.wrappedRange._getTransformedByDeletion( moveRange );

		if ( remainingRange ) {
			const range = remainingRange._getTransformedByInsertion( b.getMovedRangeStart, b.howMany );

			a.position = range.start;
			a.howMany = range.end.offset - range.start.offset;

			return [ a ];
		}
	}

	// The default case.
	//
	const range = a.wrappedRange._getTransformedByMoveOperation( b );

	a.position = range.start;
	a.howMany = range.end.offset - range.start.offset;

	return [ a ];
} );

setTransformation( WrapOperation, SplitOperation, ( a, b ) => {
	// Case 1:	If range to wrap got split by split operation cancel the wrapping.
	//
	if ( a.wrappedRange.containsPosition( b.position ) ) {
		return getNoOp();
	}

	// Case 2:	If last element from range to wrap has been split, include the newly created element in the wrap range.
	//
	if ( b.insertionPosition.isEqual( a.wrappedRange.end ) ) {
		a.howMany++;

		return [ a ];
	}

	// The default case.
	//
	const transformed = a.wrappedRange._getTransformedBySplitOperation( b );

	a.position = transformed.start;
	a.howMany = transformed.end.offset - transformed.start.offset;

	return [ a ];
} );

setTransformation( WrapOperation, WrapOperation, ( a, b, context ) => {
	// Case 1:	If ranges to wrap intersect on the same level then there is a conflict.
	//			Depending on `context.isStrong` the nodes in the intersecting part should be left as they were wrapped
	//			or moved to the new wrapping element.
	//
	//			`Foo` and `Bar` are to be wrapped in `blockQuote`, while `Bar` and `Xyz` in `div`.
	//			[<paragraph>Foo</paragraph>{<paragraph>Bar</paragraph>]<paragraph>Xyz</paragraph>}
	//
	//			After `blockQuote` wrap:
	//			<blockQuote>
	//				<paragraph>Foo</paragraph><paragraph>Bar</paragraph>
	//			</blockQuote>
	//			<paragraph>Xyz</paragraph>
	//
	//			After `div` wrap:
	//			<blockQuote>
	//				<paragraph>Foo</paragraph><paragraph>Bar</paragraph>
	//			</blockQuote>
	//			<div>
	//				<paragraph>Xyz</paragraph>
	// 			</div>
	//
	//			Or, if `div` wrap is stronger:
	//			<blockQuote>
	//				<paragraph>Foo</paragraph>
	//			</blockQuote>
	//			<div>
	//				<paragraph>Bar</paragraph><paragraph>Xyz</paragraph>
	//			</div>
	//
	//			The range from incoming operation may be also wholly included in the range from operation `b`.
	//			Then, cancel the wrapping. The same happens when the ranges are identical but in that case,
	//			`context.isStrong` decides which wrapping should be cancelled.
	//
	//			Lastly, the range from operation `b` may be wholly included in the range from incoming operation.
	//			Then, unwrap the range from operation `b` and do a wrap on full range from operation `a`.
	//
	if ( _onSameLevel( a.position, b.position ) ) {
		const ranges = a.wrappedRange.getDifference( b.wrappedRange );

		if ( ranges.length == 0 ) {
			// Range from `a` is contained in range from `b` or ranges are equal.
			if ( a.wrappedRange.isEqual( b.wrappedRange ) && context.isStrong ) {
				// If ranges are equal and `a` is a stronger operation, reverse `b` operation and then apply `a` operation.
				return [ b.getReversed(), a ];
			}

			// If `a` is contained in `b` or they are same but `b` is stronger, cancel operation `a`.
			return getNoOp();
		} else if ( ranges.length == 1 ) {
			// Ranges intersect.
			// First, calculate the range for the difference part (nodes included only in `a` operation).
			const range = ranges[ 0 ]._getTransformedByWrapOperation( b );

			// Then, assign transformed range to `a` operation.
			a.position = range.start;
			a.howMany = range.end.offset - range.start.offset;

			if ( context.isStrong ) {
				// If `a` is stronger, handle also the common part of ranges.
				// After wrapping nodes by (transformed) `a` operation, move the other nodes to the element created by operation `a`.
				const common = a.wrappedRange.getIntersection( b.wrappedRange )._getTransformedByWrapOperation( b );
				const targetPosition = a.targetPosition.getShiftedBy( a.howMany );

				return [
					a,
					new MoveOperation( common.start, common.end.offset - common.start.offset, targetPosition, 0 )
				];
			}

			return [ a ];
		} else {
			// Range from `b` is contained in range from `a`. Reverse operation `b` in addition to operation `a`.
			return [ b.getReversed(), a ];
		}
	}

	// The default case.
	//
	const transformed = a.wrappedRange._getTransformedByWrapOperation( b );

	a.position = transformed.start;
	a.howMany = transformed.end.offset - transformed.start.offset;

	return [ a ];
} );

setTransformation( WrapOperation, UnwrapOperation, ( a, b ) => {
	const transformed = a.wrappedRange._getTransformedByUnwrapOperation( b );

	a.position = transformed.start;
	a.howMany = transformed.end.offset - transformed.start.offset;

	return [ a ];
} );

// -----------------------

setTransformation( UnwrapOperation, InsertOperation, ( a, b ) => {
	// Case 1:	Insert operation inserts nodes into the unwrapped element.
	//			This does not have any impact on `UnwrapOperation#position`, but `#howMany` has to be changed.
	//
	if ( _onSameLevel( a.position ) && b.position ) {
		a.howMany += b.howMany;
	}

	a.position = a.position._getTransformedByInsertOperation( b );

	return [ a ];
} );

setTransformation( UnwrapOperation, MergeOperation, ( a, b ) => {
	// Case 1:	The element to unwrap got merged.
	//			There are multiple possible solution to resolve this conflict:
	//			 * unwrap the merge target element (all nodes are unwrapped),
	//			 * cancel the unwrap (no nodes stayed unwrapped),
	//			 * reverse the merge and apply the original unwrap (some nodes are unwrapped and some are not).
	//
	if ( a.position.isEqual( b.sourcePosition ) ) {
		return [ b.getReversed(), a ];
	}

	const transformed = a.unwrappedRange._getTransformedByMergeOperation( b );

	a.position = transformed.start;
	a.position.stickiness = 'toPrevious';
	a.howMany = transformed.end.offset - transformed.start.offset;

	return [ a ];
} );

setTransformation( UnwrapOperation, MoveOperation, ( a, b ) => {
	// Case 1:	Move operation moves nodes from the unwrapped element.
	//			This does not have any impact on `UnwrapOperation#position`, but `#howMany` has to be changed.
	//
	if ( _onSameLevel( a.position ) && b.sourcePosition ) {
		a.howMany -= b.howMany;
	}

	// Case 2:	Move operation moves nodes into the unwrapped element.
	//			This does not have any impact on `UnwrapOperation#position`, but `#howMany` has to be changed.
	//			Note, that case 1 and case 2 may happen together.
	//
	if ( _onSameLevel( a.position ) && b.targetPosition ) {
		a.howMany += b.howMany;
	}

	a.position = a.position._getTransformedByMoveOperation( b );

	return [ a ];
} );

setTransformation( UnwrapOperation, SplitOperation, ( a, b ) => {
	// Case 1:	The element to unwrap got split, so now there are two elements to unwrap.
	//			This can be solved either by providing two unwrap operations or by reversing the split and applying the original unwrap.
	//
	if ( a.unwrappedRange.containsPosition( b.position ) ) {
		return [ b.getReversed(), a ];
	}
	const transformed = a.unwrappedRange._getTransformedBySplitOperation( b );

	a.position = transformed.start;
	a.position.stickiness = 'toPrevious';
	a.howMany = transformed.end.offset - transformed.start.offset;

	return [ a ];
} );

setTransformation( UnwrapOperation, WrapOperation, ( a, b ) => {
	// Case 1:	Wrapping took place inside the element to unwrap. `UnwrapOperation#howMany` needs to be updated.
	//
	if ( _onSameLevel( a.position, b.position ) ) {
		a.howMany = a.howMany - b.howMany + 1;
	}

	// The default case.
	//
	a.position = a.position._getTransformedByWrapOperation( b );

	return [ a ];
} );

setTransformation( UnwrapOperation, UnwrapOperation, ( a, b ) => {
	// Case 1:	Operations unwrap the same element.
	//
	if ( a.position.isEqual( b.position ) ) {
		a.howMany = 0;
	}

	a.position = a.position._getTransformedByUnwrapOperation( b );

	return [ a ];
} );

// Checks whether MoveOperation targetPosition is inside a node from the moved range of the other MoveOperation.
function moveTargetIntoMovedRange( a, b ) {
	return a.targetPosition._getTransformedByDeletion( b.sourcePosition, b.howMany ) === null;
}

// Helper function for `MoveOperation` x `MoveOperation` transformation.
// Convert given ranges and target position to move operations and return them.
// Ranges and target position will be transformed on-the-fly when generating operations.
// Given `ranges` should be in the order of how they were in the original transformed operation.
// Given `targetPosition` is the target position of the first range from `ranges`.
function makeMoveOperationsFromRanges( ranges, targetPosition, a ) {
	// At this moment we have some ranges and a target position, to which those ranges should be moved.
	// Order in `ranges` array is the go-to order of after transformation.
	//
	// We are almost done. We have `ranges` and `targetPosition` to make operations from.
	// Unfortunately, those operations may affect each other. Precisely, first operation after move
	// may affect source range and target position of second and third operation. Same with second
	// operation affecting third.
	//
	// We need to fix those source ranges and target positions once again, before converting `ranges` to operations.
	const operations = [];

	// Keep in mind that nothing will be transformed if there is just one range in `ranges`.
	for ( let i = 0; i < ranges.length; i++ ) {
		// Create new operation out of a range and target position.
		const op = makeMoveOperation( ranges[ i ], targetPosition, a.isSticky );

		operations.push( op );

		// Transform other ranges by the generated operation.
		for ( let j = i + 1; j < ranges.length; j++ ) {
			// All ranges in `ranges` array should be:
			// * non-intersecting (these are part of original operation source range), and
			// * `targetPosition` does not target into them (opposite would mean that transformed operation targets "inside itself").
			//
			// This means that the transformation will be "clean" and always return one result.
			ranges[ j ] = ranges[ j ]._getTransformedByMove( op.sourcePosition, op.targetPosition, op.howMany )[ 0 ];
		}

		targetPosition = targetPosition._getTransformedByMove( op.sourcePosition, op.targetPosition, op.howMany, true, false );
	}

	return operations;
}

function makeMoveOperation( range, targetPosition ) {
	// We want to keep correct operation class.
	let OperationClass;

	if ( targetPosition.root.rootName == '$graveyard' ) {
		OperationClass = RemoveOperation;
	} else if ( range.start.root.rootName == '$graveyard' ) {
		OperationClass = ReinsertOperation;
	} else {
		OperationClass = MoveOperation;
	}

	const result = new OperationClass(
		range.start,
		range.end.offset - range.start.offset,
		targetPosition,
		0 // Is corrected anyway later.
	);

	return result;
}