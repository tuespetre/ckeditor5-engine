/**
 * @license Copyright (c) 2003-2018, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

/**
 * @module engine/model/delta/basic-transformations
 */

import deltaTransform from './transform';
const addTransformationCase = deltaTransform.addTransformationCase;

import MarkerDelta from './markerdelta';
import MergeDelta from './mergedelta';
import MoveDelta from './movedelta';
import SplitDelta from './splitdelta';
import WrapDelta from './wrapdelta';
import UnwrapDelta from './unwrapdelta';
import RenameDelta from './renamedelta';

function transformMarkerDelta( a, b ) {
	const transformedDelta = a.clone();
	const transformedOp = transformedDelta.operations[ 0 ];

	if ( transformedOp.oldRange ) {
		transformedOp.oldRange = transformedOp.oldRange.getTransformedByDelta( b )[ 0 ];
	}

	if ( transformedOp.newRange ) {
		transformedOp.newRange = transformedOp.newRange.getTransformedByDelta( b )[ 0 ];
	}

	return [ transformedDelta ];
}

addTransformationCase( MarkerDelta, SplitDelta, transformMarkerDelta );
addTransformationCase( MarkerDelta, MergeDelta, transformMarkerDelta );
addTransformationCase( MarkerDelta, WrapDelta, transformMarkerDelta );
addTransformationCase( MarkerDelta, UnwrapDelta, transformMarkerDelta );
addTransformationCase( MarkerDelta, MoveDelta, transformMarkerDelta );
addTransformationCase( MarkerDelta, RenameDelta, transformMarkerDelta );